const { Connection, Keypair, Transaction, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const fetch = require('node-fetch');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function getUserInput(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

let publicaddress; 

async function fetchData() {
  try {
    const slug = await getUserInput('Введите slug(адрес) коллекции ');
    const startingPrice = await getUserInput('Введите стартовую цену бида(в lamport): ');
    const depositLamp = await getUserInput('Введите депозит в пул бида(в lamport)(Цена которая отобразится в биде): ');

    const response = await fetch('https://graphql-txs.tensor.trade/graphql', {
      method: 'POST',
      headers: {
        'authority': 'graphql-txs.tensor.trade',
        'accept': '*/*',
        'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'content-type': 'application/json',
        'origin': 'https://www.tensor.trade',
        'referer': 'https://www.tensor.trade/',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'x-request-id': 'f89433b5-50a2-414b-a5a9-85a63db5a9c3'
      },
      body: JSON.stringify([
        {
          operationName: 'TswapInitPoolTx',
          variables: {
            config: {
              poolType: 'TOKEN',
              curveType: 'EXPONENTIAL',
              startingPrice: startingPrice,
              delta: '0',
              mmFeeBps: null,
              mmCompoundFees: true,
            },
            owner: publicaddress,
            slug: slug,
            depositLamports: depositLamp,
            topUpMarginWhenBidding: true,
            priorityMicroLamports: 1000,
          },
          query: 'query TswapInitPoolTx($config: PoolConfig!, $owner: String!, $slug: String!, $marginNr: Float, $depositLamports: Decimal, $maxTakerSellCount: Float, $mintForProof: String, $topUpMarginWhenBidding: Boolean, $priorityMicroLamports: Int!) {\n  tswapInitPoolTx(\n    config: $config\n    owner: $owner\n    slug: $slug\n    marginNr: $marginNr\n    depositLamports: $depositLamports\n    maxTakerSellCount: $maxTakerSellCount\n    mintForProof: $mintForProof\n    topUpMarginWhenBidding: $topUpMarginWhenBidding\n    priorityMicroLamports: $priorityMicroLamports\n  ) {\n    txs {\n      ...TxResponse\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment TxResponse on OnchainTx {\n  tx\n  txV0\n  lastValidBlockHeight\n  metadata\n  __typename\n}',
        },
      ]),
    });

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('There was a problem with your fetch operation:', error);
  }
}

async function main() {
  const conn = new Connection('https://api.mainnet-beta.solana.com');

  const senderPrivateKeyHex = await getUserInput('Введите приватный ключ от кошелька');
  const senderKeypair = Keypair.fromSecretKey(bs58.decode(senderPrivateKeyHex));
  publicaddress = Keypair.fromSecretKey(bs58.decode(senderPrivateKeyHex)).publicKey.toBase58();
  console.log(publicaddress);

  const result = await fetchData();
  const txV0 = result[0].data.tswapInitPoolTx.txs[0].txV0;
  const txsToSign = result[0].data.tswapInitPoolTx.txs.map(
    (tx) =>
      tx.txV0 ? VersionedTransaction.deserialize(txV0.data) : Transaction.from(tx.tx.data)
  );

  const dataRaw = txsToSign[0];
  const publicKeyIndex = 1;
  const staticAccountKeys = dataRaw.message.staticAccountKeys;

  if (staticAccountKeys && staticAccountKeys.length > publicKeyIndex) {
    const PoolPublicAddress = staticAccountKeys[publicKeyIndex];
    console.log('Паблик пула ' + PoolPublicAddress);
  } else {
    console.error('Отсутсвует паблик пула');
  }

  
  
  for (const tx of txsToSign) {
    tx.sign([senderKeypair]);

    try {
      const sig = await conn.sendTransaction(tx, {
        skipPreflight: true,
        preflightCommitment: 'finalized',
      });
      await conn.confirmTransaction(sig, 'finalized');
      console.log('Transaction confirmed with signature:', sig);
    } catch (error) {
      console.error('Error sending transaction:', error);
    }
  }
  

  rl.close(); 
}

main();
