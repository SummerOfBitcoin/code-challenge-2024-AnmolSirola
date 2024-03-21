const fs = require('fs');
const crypto = require('crypto');

const MEMPOOL_PATH = './mempool';
const DIFFICULTY_TARGET = '0000ffff00000000000000000000000000000000000000000000000000000000';
const OUTPUT_FILE = 'output.txt';
const BLOCK_HEIGHT = 1;
const MINER_ADDRESS = 'miner_address';
const BLOCK_REWARD = 6.25 
const MAX_BLOCK_SIZE = 1000000; // 1 MB

function calculateHash(block) {
  const blockString = JSON.stringify(block);
  return crypto.createHash('sha256').update(blockString).digest('hex');
}

function createCoinbaseTransaction(blockHeight, minerAddress) {
  return {
    txid: crypto.randomBytes(32).toString('hex'),
    vin: [
      {
        txid: '0'.repeat(64),
        vout: 0xffffffff,
        scriptSig: '',
        sequence: 0xffffffff,
      },
    ],
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
  if (!transaction.txid || !Array.isArray(transaction.vin) || !Array.isArray(transaction.vout)) {
    return false;
  }
  // Check if the transaction inputs and outputs are valid
  const totalInput = transaction.vin.reduce((sum, input) => sum + (input.value || 0), 0);
  const totalOutput = transaction.vout.reduce((sum, output) => sum + output.value, 0);
  if (totalInput !== totalOutput) {
    return false;
  }
  return true;
}

function calculateTransactionFee(transaction) {
  const totalInput = transaction.vin.reduce((sum, input) => sum + (input.value || 0), 0);
  const totalOutput = transaction.vout.reduce((sum, output) => sum + output.value, 0);
  return totalInput - totalOutput;
}

function mineBlock(transactions, blockHeight, minerAddress) {
  const coinbaseTransaction = createCoinbaseTransaction(blockHeight, minerAddress);
  const validTransactions = transactions.filter(isValidTransaction);
  // Calculating total fee collected (including coinbase transaction)
  const totalFee = validTransactions.reduce((sum, tx) => sum + calculateTransactionFee(tx), 0) + BLOCK_REWARD;

  let blockTransactions = [coinbaseTransaction];
  let blockSize = Buffer.from(JSON.stringify(coinbaseTransaction), 'utf8').length;
  for (const tx of validTransactions) {
    const txSize = Buffer.from(JSON.stringify(tx), 'utf8').length;
    if (blockSize + txSize <= MAX_BLOCK_SIZE) {
      blockTransactions.push(tx);
      blockSize += txSize;
    } else {
      break;
    }
  }

  // Create the block header
  const merkleRoot = calculateMerkleRoot(blockTransactions.map(tx => tx.txid));
  const timestamp = Math.floor(Date.now() / 1000);
  let nonce = 0;
  let blockHeader = '';
  let blockHash = '';
  while (true) {
    blockHeader = calculateBlockHeader(blockHeight, merkleRoot, timestamp, nonce);
    blockHash = calculateHash(blockHeader);
    if (blockHash < DIFFICULTY_TARGET) {
      break;
    }
    nonce++;
  }

  return {
    blockHeader,
    coinbaseTransaction: JSON.stringify(coinbaseTransaction),
    transactionIds: blockTransactions.map((tx) => tx.txid),
    totalFee,
    blockSize,
  };
}

function calculateMerkleRoot(transactionIds) {
  if (transactionIds.length === 0) {
    return '0'.repeat(64);
  }
  if (transactionIds.length === 1) {
    return transactionIds[0];
  }

  const combinedIds = [];
  for (let i = 0; i < transactionIds.length; i += 2) {
    const leftId = transactionIds[i];
    const rightId = i + 1 < transactionIds.length ? transactionIds[i + 1] : leftId;
    combinedIds.push(calculateHash(leftId + rightId));
  }
  return calculateMerkleRoot(combinedIds);
}

function calculateBlockHeader(blockHeight, merkleRoot, timestamp, nonce) {
  return `${blockHeight}${merkleRoot}${timestamp}${DIFFICULTY_TARGET}${nonce}`;
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
  console.log(`Total fee collected: ${minedBlock.totalFee}`);
  console.log(`Block size: ${minedBlock.blockSize} bytes`);
  console.log(`Available block space: ${MAX_BLOCK_SIZE} bytes`);
  console.log(`Block space utilized: ${((minedBlock.blockSize / MAX_BLOCK_SIZE) * 100).toFixed(2)}%`);
}

main();
