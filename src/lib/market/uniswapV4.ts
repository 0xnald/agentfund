import { formatUnits, getAddress, parseAbi } from "viem";
import { env } from "@/lib/env";
import { getTokenMetadata, xLayerClient } from "@/lib/xlayer/client";

const poolManagerAbi = parseAbi([
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"
]);
const [initializeEvent, swapEvent] = poolManagerAbi;

export type UniswapV4PoolOpportunity = {
  poolId: `0x${string}`;
  tokenAddress: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  pool: {
    poolManager: `0x${string}`;
    currency0: `0x${string}`;
    currency1: `0x${string}`;
    fee: number;
    tickSpacing: number;
    hooks: `0x${string}`;
    initializedAtBlock: string;
    latestSwapBlock?: string;
  };
  priceUsd: number;
  route: {
    quoteTokenAddress: `0x${string}`;
    quoteTokenSymbol: string;
    direction: "currency0_to_quote" | "currency1_to_quote";
    source: "uniswap_v4_pool_sqrt_price";
  };
  activity: {
    swapCount: number;
    buyPressure: number;
    sellPressure: number;
    liquidity?: string;
    latestTick?: number;
  };
  score: {
    score: number;
    grade: "avoid" | "watch" | "qualified" | "high_conviction";
    factors: string[];
    riskFlags: string[];
  };
};

type InitializeEvent = {
  poolId: `0x${string}`;
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  fee: number;
  tickSpacing: number;
  hooks: `0x${string}`;
  sqrtPriceX96: bigint;
  tick: number;
  blockNumber: bigint;
};

type SwapEvent = {
  poolId: `0x${string}`;
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
  blockNumber: bigint;
};

type DecodedPoolLog = {
  args?: Record<string, unknown>;
  blockNumber?: bigint | null;
};

type PoolLogCache = {
  latestBlock: bigint;
  initializedPools: InitializeEvent[];
};

let poolLogCache: PoolLogCache | undefined;

async function getChunkedPoolLogs(params: {
  poolManager: `0x${string}`;
  event: typeof initializeEvent | typeof swapEvent;
  fromBlock: bigint;
  toBlock: bigint;
}) {
  const logs: DecodedPoolLog[] = [];
  const chunkSize = BigInt(env.UNISWAP_V4_LOG_CHUNK_BLOCKS);
  const chunks: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  let chunkStart = params.fromBlock;

  while (chunkStart <= params.toBlock) {
    const chunkEnd = chunkStart + chunkSize - 1n > params.toBlock ? params.toBlock : chunkStart + chunkSize - 1n;
    chunks.push({ fromBlock: chunkStart, toBlock: chunkEnd });
    chunkStart = chunkEnd + 1n;
  }

  for (let index = 0; index < chunks.length; index += env.UNISWAP_V4_LOG_CONCURRENCY) {
    const batch = chunks.slice(index, index + env.UNISWAP_V4_LOG_CONCURRENCY);
    const batchLogs = await Promise.all(
      batch.map((chunk) =>
        getPoolLogChunk({
          poolManager: params.poolManager,
          event: params.event,
          fromBlock: chunk.fromBlock,
          toBlock: chunk.toBlock
        })
      )
    );

    for (const chunkLogs of batchLogs) {
      logs.push(...(chunkLogs as DecodedPoolLog[]));
    }
  }

  return logs;
}

async function getPoolLogChunk(params: {
  poolManager: `0x${string}`;
  event: typeof initializeEvent | typeof swapEvent;
  fromBlock: bigint;
  toBlock: bigint;
}) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await xLayerClient.getLogs({
        address: params.poolManager,
        event: params.event,
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

function normalizeAddress(value: string): `0x${string}` {
  return getAddress(value) as `0x${string}`;
}

function quoteTokens() {
  return env.UNISWAP_V4_QUOTE_TOKEN_ADDRESSES.split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => normalizeAddress(item));
}

function sqrtPriceToToken1PerToken0(sqrtPriceX96: bigint, token0Decimals: number, token1Decimals: number) {
  const sqrt = Number(sqrtPriceX96) / 2 ** 96;
  const rawRatio = sqrt * sqrt;
  return rawRatio * 10 ** (token0Decimals - token1Decimals);
}

function scorePool(params: {
  priceUsd: number;
  swapCount: number;
  liquidity?: bigint;
  hooks: `0x${string}`;
  fee: number;
}) {
  const factors: string[] = [];
  const riskFlags: string[] = [];
  let score = 35;

  if (params.priceUsd > 0) {
    score += 20;
    factors.push("priced through configured Uniswap v4 quote asset");
  } else {
    score -= 15;
    riskFlags.push("no stable quote route found");
  }

  if (params.swapCount >= 10) {
    score += 18;
    factors.push("active recent swap flow");
  } else if (params.swapCount > 0) {
    score += 8;
    factors.push("recent swap flow detected");
  } else {
    riskFlags.push("no recent swap activity in scan window");
  }

  if (params.liquidity && params.liquidity > 0n) {
    score += 14;
    factors.push("latest swap reported active pool liquidity");
  } else {
    riskFlags.push("pool liquidity not confirmed from recent swap event");
  }

  if (params.hooks !== "0x0000000000000000000000000000000000000000") {
    score -= 6;
    riskFlags.push("custom Uniswap v4 hook requires review");
  }

  if (params.fee <= 3000) {
    score += 5;
    factors.push("standard or low fee tier");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade: UniswapV4PoolOpportunity["score"]["grade"] =
    score >= 82 ? "high_conviction" : score >= 65 ? "qualified" : score >= 45 ? "watch" : "avoid";

  return { score, grade, factors, riskFlags };
}

function parseInitializeLogs(logs: DecodedPoolLog[]) {
  return logs
    .map((log) => {
      const args = log.args;

      if (
        !args?.id ||
        !args.currency0 ||
        !args.currency1 ||
        args.sqrtPriceX96 === undefined ||
        args.tick === undefined ||
        log.blockNumber === undefined ||
        log.blockNumber === null
      ) {
        return undefined;
      }

      return {
        poolId: args.id as `0x${string}`,
        currency0: normalizeAddress(String(args.currency0)),
        currency1: normalizeAddress(String(args.currency1)),
        fee: Number(args.fee ?? 0),
        tickSpacing: Number(args.tickSpacing ?? 0),
        hooks: normalizeAddress(String(args.hooks ?? "0x0000000000000000000000000000000000000000")),
        sqrtPriceX96: args.sqrtPriceX96 as bigint,
        tick: Number(args.tick),
        blockNumber: log.blockNumber
      } satisfies InitializeEvent;
    })
    .filter((event) => event !== undefined);
}

function parseSwapLogs(logs: DecodedPoolLog[]) {
  return logs
    .map((log) => {
      const args = log.args;

      if (
        !args?.id ||
        args.amount0 === undefined ||
        args.amount1 === undefined ||
        args.sqrtPriceX96 === undefined ||
        log.blockNumber === undefined ||
        log.blockNumber === null
      ) {
        return undefined;
      }

      return {
        poolId: args.id as `0x${string}`,
        amount0: args.amount0 as bigint,
        amount1: args.amount1 as bigint,
        sqrtPriceX96: args.sqrtPriceX96 as bigint,
        liquidity: (args.liquidity as bigint | undefined) ?? 0n,
        tick: Number(args.tick ?? 0),
        blockNumber: log.blockNumber
      } satisfies SwapEvent;
    })
    .filter((event) => event !== undefined);
}

export async function discoverUniswapV4Opportunities(limit: number): Promise<UniswapV4PoolOpportunity[]> {
  const latestBlock = await xLayerClient.getBlockNumber();
  const poolFromBlock =
    latestBlock > BigInt(env.UNISWAP_V4_POOL_DISCOVERY_BLOCKS)
      ? latestBlock - BigInt(env.UNISWAP_V4_POOL_DISCOVERY_BLOCKS)
      : 0n;
  const swapFromBlock =
    latestBlock > BigInt(env.UNISWAP_V4_SWAP_SCAN_BLOCKS) ? latestBlock - BigInt(env.UNISWAP_V4_SWAP_SCAN_BLOCKS) : 0n;
  const poolManager = normalizeAddress(env.UNISWAP_V4_POOL_MANAGER_ADDRESS);

  const initializedPools =
    poolLogCache && latestBlock - poolLogCache.latestBlock < 100n
      ? poolLogCache.initializedPools
      : parseInitializeLogs(
          await getChunkedPoolLogs({
            poolManager,
            event: initializeEvent,
            fromBlock: poolFromBlock,
            toBlock: latestBlock
          })
        );
  poolLogCache = { latestBlock, initializedPools };

  const [swapLogs] = await Promise.all([
    getChunkedPoolLogs({
      poolManager,
      event: swapEvent,
      fromBlock: swapFromBlock,
      toBlock: latestBlock
    })
  ]);

  const swaps = parseSwapLogs(swapLogs);
  const swapsByPool = new Map<`0x${string}`, SwapEvent[]>();

  for (const swap of swaps) {
    const poolSwaps = swapsByPool.get(swap.poolId) ?? [];
    poolSwaps.push(swap);
    swapsByPool.set(swap.poolId, poolSwaps);
  }

  const quoteSet = new Set(quoteTokens().map((address) => address.toLowerCase()));
  const quoteMetadata = new Map<string, Awaited<ReturnType<typeof getTokenMetadata>>>();

  const opportunities = await Promise.all(
    initializedPools
      .filter((pool) => quoteSet.has(pool.currency0.toLowerCase()) || quoteSet.has(pool.currency1.toLowerCase()))
      .map(async (pool) => {
        const tokenAddress = quoteSet.has(pool.currency0.toLowerCase()) ? pool.currency1 : pool.currency0;
        const quoteTokenAddress = quoteSet.has(pool.currency0.toLowerCase()) ? pool.currency0 : pool.currency1;
        const direction = quoteSet.has(pool.currency0.toLowerCase()) ? "currency1_to_quote" : "currency0_to_quote";
        const [token, quoteToken] = await Promise.all([
          getTokenMetadata(tokenAddress),
          quoteMetadata.get(quoteTokenAddress.toLowerCase()) ?? getTokenMetadata(quoteTokenAddress)
        ]);
        quoteMetadata.set(quoteTokenAddress.toLowerCase(), quoteToken);

        const poolSwaps = swapsByPool.get(pool.poolId) ?? [];
        const latestSwap = poolSwaps.sort((a, b) => Number(b.blockNumber - a.blockNumber))[0];
        const sqrtPriceX96 = latestSwap?.sqrtPriceX96 ?? pool.sqrtPriceX96;
        const currency0 = pool.currency0.toLowerCase() === tokenAddress.toLowerCase() ? token : quoteToken;
        const currency1 = pool.currency1.toLowerCase() === tokenAddress.toLowerCase() ? token : quoteToken;
        const token1PerToken0 = sqrtPriceToToken1PerToken0(sqrtPriceX96, currency0.decimals, currency1.decimals);
        const priceUsd = direction === "currency0_to_quote" ? token1PerToken0 : token1PerToken0 > 0 ? 1 / token1PerToken0 : 0;
        const buyPressure = poolSwaps.filter((swap) => (direction === "currency0_to_quote" ? swap.amount0 < 0n : swap.amount1 < 0n)).length;
        const sellPressure = Math.max(0, poolSwaps.length - buyPressure);

        return {
          poolId: pool.poolId,
          tokenAddress,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          pool: {
            poolManager,
            currency0: pool.currency0,
            currency1: pool.currency1,
            fee: pool.fee,
            tickSpacing: pool.tickSpacing,
            hooks: pool.hooks,
            initializedAtBlock: pool.blockNumber.toString(),
            latestSwapBlock: latestSwap?.blockNumber.toString()
          },
          priceUsd,
          route: {
            quoteTokenAddress,
            quoteTokenSymbol: quoteToken.symbol,
            direction,
            source: "uniswap_v4_pool_sqrt_price" as const
          },
          activity: {
            swapCount: poolSwaps.length,
            buyPressure,
            sellPressure,
            liquidity: latestSwap?.liquidity ? formatUnits(latestSwap.liquidity, 0) : undefined,
            latestTick: latestSwap?.tick ?? pool.tick
          },
          score: scorePool({
            priceUsd,
            swapCount: poolSwaps.length,
            liquidity: latestSwap?.liquidity,
            hooks: pool.hooks,
            fee: pool.fee
          })
        } satisfies UniswapV4PoolOpportunity;
      })
  );

  return opportunities.sort((a, b) => b.score.score - a.score.score).slice(0, limit);
}
