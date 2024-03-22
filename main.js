const fs = require('fs');
const crypto = require('crypto');
const secp256k1 = require('secp256k1');

const DIFFICULTY_TARGET = '0000ffff00000000000000000000000000000000000000000000000000000000';
const BLOCK_REWARD = 6;

function readTransactionsFromMempool() {
  const mempoolDir = './mempool';
  const files = fs.readdirSync(mempoolDir);
  const transactions = files.map(file => {
    const content = fs.readFileSync(`${mempoolDir}/${file}`, 'utf8');
    return JSON.parse(content);
  });
  return transactions;
}

function validateTransaction(transaction) {
  // Check transaction structure
  if (!transaction.version || !Array.isArray(transaction.vin) || !Array.isArray(transaction.vout)) {
    return false;
  }

  // Check transaction inputs
  for (const input of transaction.vin) {
    if (!input.txid || !input.vout || !input.scriptSig || !input.sequence) {
      return false;
    }
  }

  // Check transaction outputs
  for (const output of transaction.vout) {
    if (!output.value || !output.scriptPubKey) {
      return false;
    }
  }

  // Verify transaction signatures
  // (Placeholder implementation, you need to add actual signature verification logic)
  for (const input of transaction.vin) {
    if (!verifySignature(input)) {
      return false;
    }
  }

  return true;
}

function createCoinbaseTransaction(blockHeight, minerAddress) {
  const bufferWriter = Buffer.alloc(8);
  bufferWriter.writeInt32LE(blockHeight, 0);
  
  const transaction = {
    version: 1,
    vin: [
      {
        coinbase: bufferWriter.toString('hex'),
        sequence: 0xffffffff,
      },
    ],
    vout: [
      {
        value: BLOCK_REWARD,
        scriptPubKey: `OP_DUP OP_HASH160 ${minerAddress} OP_EQUALVERIFY OP_CHECKSIG`,
      },
    ],
  };
  return transaction;
}

function serializeCoinbaseTransaction(coinbaseTransaction) {
  return JSON.stringify(coinbaseTransaction);
}

function createBlockHeader(version, previousBlockHash, merkleRoot, timestamp, bits, nonce) {
  const blockHeader = {
    version,
    previousBlockHash,
    merkleRoot,
    timestamp,
    bits,
    nonce,
  };
  return blockHeader;
}

function serializeBlockHeader(blockHeader) {
  return JSON.stringify(blockHeader);
}

function calculateBlockHash(blockHeader) {
  const serializedHeader = serializeBlockHeader(blockHeader);
  const hash = crypto.createHash('sha256').update(serializedHeader).digest('hex');
  return hash;
}

function mineBlock(blockHeader, difficulty) {
  let nonce = 0;
  let hash = calculateBlockHash(blockHeader);

  while (hash >= difficulty) {
    nonce++;
    blockHeader.nonce = nonce;
    hash = calculateBlockHash(blockHeader);
  }

  return blockHeader;
}

function writeTxidsToFile(txids) {
  const outputFile = 'output.txt';
  const content = txids.join('\n');
  fs.writeFileSync(outputFile, content);
}

// Main script flow
const transactions = readTransactionsFromMempool();
const validTransactions = transactions.filter(validateTransaction);

const coinbaseTransaction = createCoinbaseTransaction(1, 'minerAddress');
const serializedCoinbaseTransaction = serializeCoinbaseTransaction(coinbaseTransaction);

const blockHeader = createBlockHeader(1, '0'.repeat(64), 'merkleRoot', Date.now(), DIFFICULTY_TARGET, 0);
const minedBlockHeader = mineBlock(blockHeader, DIFFICULTY_TARGET);
const serializedBlockHeader = serializeBlockHeader(minedBlockHeader);

const txids = [serializedCoinbaseTransaction, ...validTransactions.map(tx => tx.txid)];
writeTxidsToFile([serializedBlockHeader, ...txids]);

console.log('Block mined successfully!');