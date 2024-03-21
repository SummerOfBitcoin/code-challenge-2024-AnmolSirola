
const MEMPOOL_PATH = './mempool';
const fs = require('fs');
const crypto = require('crypto');


const DIFFICULTY_TARGET = '0000ffff00000000000000000000000000000000000000000000000000000000';
const OUTPUT_FILE = 'output.txt';
const BLOCK_HEIGHT = 1;
const MINER_ADDRESS = 'miner_address';
const BLOCK_REWARD = 50;
const MAX_BLOCK_SIZE = 1000000; // 1 MB

function calculateHash(block) {
  const blockString = JSON.stringify(block);
  return crypto.createHash('sha256').update(blockString).digest('hex');
}

function createCoinbaseTransaction(blockHeight, minerAddress) {
  return {
    txid: crypto.randomBytes(32).toString('hex'),
    vin: [],
    vout: [
      {
        value: BLOCK_REWARD,
        scriptPubKey: {
          addresses: [minerAddress],
        },
      },
    ],
  };
}

function isValidTransaction(transaction) {
  // Check if the transaction has a valid structure
  if (!transaction.txid || !transaction.vin || !transaction.vout) {
    return false;
  }

  // Check if the transaction inputs and outputs are valid
  const totalInput = transaction.vin.reduce((sum, input) => sum + input.value, 0);
  const totalOutput = transaction.vout.reduce((sum, output) => sum + output.value, 0);
  if (totalInput !== totalOutput) {
    return false;
  }


  return true;
}

function calculateTransactionFee(transaction) {
  const totalInput = transaction.vin.reduce((sum, input) => sum + input.value, 0);
  const totalOutput = transaction.vout.reduce((sum, output) => sum + output.value, 0);
  return totalInput - totalOutput;
}

function mineBlock(transactions, blockHeight, minerAddress) {
  const coinbaseTransaction = createCoinbaseTransaction(blockHeight, minerAddress);
  const validTransactions = transactions.filter(isValidTransaction);
  const blockTransactions = [coinbaseTransaction, ...validTransactions];

  let blockSize = JSON.stringify(blockTransactions).length;
  while (blockSize > MAX_BLOCK_SIZE) {
    validTransactions.pop();
    blockTransactions.pop();
    blockSize = JSON.stringify(blockTransactions).length;
  }

  const block = {
    height: blockHeight,
    transactions: blockTransactions,
    previousBlockHash: '',
    timestamp: Date.now(),
    nonce: 0,
  };

  while (true) {
    const blockHash = calculateHash(block);
    if (blockHash < DIFFICULTY_TARGET) {
      return {
        blockHeader: blockHash,
        coinbaseTransaction: JSON.stringify(coinbaseTransaction),
        transactionIds: blockTransactions.map((tx) => tx.txid),
      };
    }
    block.nonce++;
  }
}

function readTransactionsFromMempool() {
  const transactionFiles = fs.readdirSync(MEMPOOL_PATH);
  const transactions = transactionFiles.map((file) => {
    const transactionData = fs.readFileSync(`${MEMPOOL_PATH}/${file}`, 'utf8');
    return JSON.parse(transactionData);
  });
  return transactions;
}

function main() {
  const transactions = readTransactionsFromMempool();
  const minedBlock = mineBlock(transactions, BLOCK_HEIGHT, MINER_ADDRESS);

  const outputContent = `${minedBlock.blockHeader}\n${minedBlock.coinbaseTransaction}\n${minedBlock.transactionIds.join('\n')}`;
  fs.writeFileSync(OUTPUT_FILE, outputContent);

  console.log('Block mined successfully!');
}

main();
