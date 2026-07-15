import { createPublicClient, defineChain, formatEther, http, isAddress } from "viem";
import { env } from "@/lib/env";

export const xLayer = defineChain({
  id: env.NEXT_PUBLIC_AGENTFUND_CHAIN_ID,
  name: env.NEXT_PUBLIC_AGENTFUND_CHAIN_NAME,
  nativeCurrency: {
    decimals: 18,
    name: "OKB",
    symbol: "OKB"
  },
  rpcUrls: {
    default: {
      http: [env.XLAYER_RPC_URL]
    }
  },
  blockExplorers: {
    default: {
      name: "OKLink",
      url: "https://www.oklink.com/xlayer"
    }
  }
});

export const xLayerClient = createPublicClient({
  chain: xLayer,
  transport: http(env.XLAYER_RPC_URL)
});

export async function getChainSnapshot() {
  const [blockNumber, gasPrice, receiverBalance] = await Promise.all([
    xLayerClient.getBlockNumber(),
    xLayerClient.getGasPrice(),
    xLayerClient.getBalance({
      address: env.NEXT_PUBLIC_AGENTFUND_RECEIVER_ADDRESS as `0x${string}`
    })
  ]);

  return {
    chainId: xLayer.id,
    chainName: xLayer.name,
    rpcUrl: env.XLAYER_RPC_URL,
    blockNumber: blockNumber.toString(),
    gasPriceWei: gasPrice.toString(),
    gasPriceOkb: formatEther(gasPrice),
    receiver: env.NEXT_PUBLIC_AGENTFUND_RECEIVER_ADDRESS,
    receiverBalanceOkb: formatEther(receiverBalance)
  };
}

export function parseAddress(value: string, fieldName = "address"): `0x${string}` {
  if (!isAddress(value)) {
    throw new Error(`${fieldName} must be a valid EVM address.`);
  }

  return value;
}

export function getWatchlist(): `0x${string}`[] {
  return env.AGENTFUND_WATCHLIST.split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => parseAddress(item, "AGENTFUND_WATCHLIST entry"));
}
