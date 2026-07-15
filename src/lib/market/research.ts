import { getAddress, parseAbi } from "viem";
import { env } from "@/lib/env";
import { getTokenMetadata, getWatchlist, xLayerClient } from "@/lib/xlayer/client";

const transferAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)"
]);
const [transferEvent] = transferAbi;

type DecodedTransferLog = {
  args?: {
    from?: `0x${string}`;
    to?: `0x${string}`;
    value?: bigint;
  };
  blockNumber?: bigint | null;
};

export type ResearchCandidate = {
  tokenAddress: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  priceUsd: number;
  source: "xlayer_research_transfer_activity";
  activity: {
    transferCount: number;
    uniqueWallets: number;
    nonZeroTransfers: number;
    scanBlocks: number;
  };
  score: {
    score: number;
    grade: "avoid" | "watch" | "qualified" | "high_conviction";
    factors: string[];
    riskFlags: string[];
  };
  research: {
    method: "erc20_transfer_activity";
    confidence: "low" | "medium" | "high";
    notes: string[];
  };
};

function normalizeAddress(value: string): `0x${string}` {
  return getAddress(value) as `0x${string}`;
}

function quoteTokenSet() {
  return new Set(
    env.UNISWAP_V4_QUOTE_TOKEN_ADDRESSES.split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function getTransferChunk(params: {
  tokenAddress: `0x${string}`;
  fromBlock: bigint;
  toBlock: bigint;
}) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await xLayerClient.getLogs({
        address: params.tokenAddress,
        event: transferEvent,
        fromBlock: params.fromBlock,
        toBlock: params.toBlock
      });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw lastError;
}

async function getRecentTransferLogs(tokenAddress: `0x${string}`) {
  const latestBlock = await xLayerClient.getBlockNumber();
  const fromBlock =
    latestBlock > BigInt(env.RESEARCH_TRANSFER_SCAN_BLOCKS)
      ? latestBlock - BigInt(env.RESEARCH_TRANSFER_SCAN_BLOCKS)
      : 0n;
  const chunks: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const chunkSize = BigInt(env.RESEARCH_LOG_CHUNK_BLOCKS);
  let chunkStart = fromBlock;
  const logs: DecodedTransferLog[] = [];

  while (chunkStart <= latestBlock) {
    const chunkEnd = chunkStart + chunkSize - 1n > latestBlock ? latestBlock : chunkStart + chunkSize - 1n;
    chunks.push({ fromBlock: chunkStart, toBlock: chunkEnd });
    chunkStart = chunkEnd + 1n;
  }

  for (let index = 0; index < chunks.length; index += env.RESEARCH_LOG_CONCURRENCY) {
    const batch = chunks.slice(index, index + env.RESEARCH_LOG_CONCURRENCY);
    const batchLogs = await Promise.all(
      batch.map((chunk) =>
        getTransferChunk({
          tokenAddress,
          fromBlock: chunk.fromBlock,
          toBlock: chunk.toBlock
        })
      )
    );

    for (const chunkLogs of batchLogs) {
      logs.push(...(chunkLogs as DecodedTransferLog[]));
    }
  }

  return logs;
}

function scoreResearchCandidate(params: {
  transferCount: number;
  uniqueWallets: number;
  nonZeroTransfers: number;
}) {
  const factors: string[] = [];
  const riskFlags: string[] = [];
  let score = 10;
  const transferScore = Math.min(40, Math.floor(params.transferCount * 1.2));
  const walletScore = Math.min(30, Math.floor(params.uniqueWallets * 1.5));
  score += transferScore + walletScore;

  if (params.transferCount >= 20) {
    factors.push("strong recent transfer activity");
  } else if (params.transferCount >= 5) {
    factors.push("moderate recent transfer activity");
  } else if (params.transferCount > 0) {
    factors.push("some recent transfer activity");
  } else {
    riskFlags.push("no recent transfer activity in research window");
  }

  if (params.uniqueWallets >= 10) {
    factors.push("broad wallet participation");
  } else if (params.uniqueWallets >= 3) {
    factors.push("limited wallet participation");
  } else {
    riskFlags.push("very narrow wallet participation");
  }

  if (params.nonZeroTransfers === params.transferCount && params.transferCount > 0) {
    score += 5;
    factors.push("all observed transfers had non-zero value");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade: ResearchCandidate["score"]["grade"] =
    score >= 82 ? "high_conviction" : score >= 65 ? "qualified" : score >= 45 ? "watch" : "avoid";

  return { score, grade, factors, riskFlags };
}

export async function researchCandidates(limit: number, explicitToken?: `0x${string}`): Promise<ResearchCandidate[]> {
  const quotes = quoteTokenSet();
  const tokenAddresses = explicitToken
    ? [explicitToken]
    : getWatchlist().filter((tokenAddress) => !quotes.has(tokenAddress.toLowerCase()));

  const candidates: ResearchCandidate[] = [];

  for (const address of tokenAddresses) {
    const tokenAddress = normalizeAddress(address);
    const metadata = await getTokenMetadata(tokenAddress);
    const logs = await getRecentTransferLogs(tokenAddress).catch(() => []);
      const wallets = new Set<string>();
      let nonZeroTransfers = 0;

      for (const log of logs) {
        if (log.args?.from) {
          wallets.add(log.args.from.toLowerCase());
        }

        if (log.args?.to) {
          wallets.add(log.args.to.toLowerCase());
        }

        if ((log.args?.value ?? 0n) > 0n) {
          nonZeroTransfers += 1;
        }
      }

      const score = scoreResearchCandidate({
        transferCount: logs.length,
        uniqueWallets: wallets.size,
        nonZeroTransfers
      });
      const confidence = score.score >= 65 ? "high" : score.score >= 40 ? "medium" : "low";

    candidates.push({
        ...metadata,
        priceUsd: 0,
        source: "xlayer_research_transfer_activity",
        activity: {
          transferCount: logs.length,
          uniqueWallets: wallets.size,
          nonZeroTransfers,
          scanBlocks: env.RESEARCH_TRANSFER_SCAN_BLOCKS
        },
        score,
        research: {
          method: "erc20_transfer_activity",
          confidence,
          notes: [
            logs.length > 0
              ? "Selected from recent X Layer ERC-20 transfer activity because no quote-routed Uniswap v4 pool was found."
              : "Recent transfer scan returned no logs or was rate-limited by the public X Layer RPC.",
            "Price and slippage remain unavailable until a routed pool is discovered."
          ]
        }
      } satisfies ResearchCandidate);
  }

  return candidates.sort((a, b) => b.score.score - a.score.score).slice(0, limit);
}
