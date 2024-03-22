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
  const buffer = Buffer.alloc(1000);
  let offset = 0;


  buffer.writeInt32LE(coinbaseTransaction.version, offset);
  offset += 4;

  // Input count
  buffer.writeUInt8(coinbaseTransaction.vin.length, offset);
  offset += 1;

  // Inputs
  for (const input of coinbaseTransaction.vin) {
    // Coinbase data
    const coinbaseData = Buffer.from(input.coinbase, 'hex');
    buffer.writeUInt8(coinbaseData.length, offset);
    offset += 1;
    coinbaseData.copy(buffer, offset);
    offset += coinbaseData.length;

    
    buffer.writeUInt32LE(input.sequence, offset);
    offset += 4;
  }

  // Output count
  buffer.writeUInt8(coinbaseTransaction.vout.length, offset);
  offset += 1;

  // Outputs
  for (const output of coinbaseTransaction.vout) {
    
    buffer.writeBigInt64LE(BigInt(output.value * 1e8), offset);
    offset += 8;

    // Script length
    const scriptPubKey = Buffer.from(output.scriptPubKey, 'ascii');
    buffer.writeUInt8(scriptPubKey.length, offset);
    offset += 1;

    // Script public key
    scriptPubKey.copy(buffer, offset);
    offset += scriptPubKey.length;
  }

  // Locktime
  buffer.writeUInt32LE(0, offset);
  offset += 4;

  return buffer.slice(0, offset).toString('hex');
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
  const buffer = Buffer.alloc(80);

  buffer.writeInt32LE(blockHeader.version, 0);
  Buffer.from(blockHeader.previousBlockHash, 'hex').copy(buffer, 4);
  Buffer.from(blockHeader.merkleRoot, 'hex').copy(buffer, 36);
  buffer.writeUInt32LE(blockHeader.timestamp, 68);
  Buffer.from(blockHeader.bits, 'hex').copy(buffer, 72);
  buffer.writeUInt32LE(blockHeader.nonce, 76);

  return buffer.toString('hex');
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

function calculateMerkleRoot(transactions) {
  if (transactions.length === 0) {
    return '0'.repeat(64);
  }
  if (transactions.length === 1) {
    return transactions[0].txid;
  }

  const concatenatedTxids = transactions.map(tx => tx.txid).join('');
  const hash = crypto.createHash('sha256').update(concatenatedTxids).digest('hex');
  return hash;
}

function writeTxidsToFile(blockHeader, coinbaseTransaction, txids) {
  const outputFile = 'output.txt';
  const serializedBlockHeader = serializeBlockHeader(blockHeader);
  const serializedCoinbaseTransaction = serializeCoinbaseTransaction(coinbaseTransaction);
  const content = `${serializedBlockHeader}\n${serializedCoinbaseTransaction}\n${txids.join('\n')}`;
  fs.writeFileSync(outputFile, content);
}

// Main script flow
const transactions = readTransactionsFromMempool();
const validTransactions = transactions.filter(validateTransaction);

const coinbaseTransaction = createCoinbaseTransaction(1, 'minerAddress');
coinbaseTransaction.txid = crypto.createHash('sha256').update(serializeCoinbaseTransaction(coinbaseTransaction)).digest('hex');

const merkleRoot = calculateMerkleRoot([coinbaseTransaction, ...validTransactions]);
const blockHeader = createBlockHeader(1, '0'.repeat(64), merkleRoot, Math.floor(Date.now() / 1000), DIFFICULTY_TARGET, 0);
const minedBlockHeader = mineBlock(blockHeader, DIFFICULTY_TARGET);

const txids = [coinbaseTransaction.txid, ...validTransactions.map(tx => tx.txid)];
writeTxidsToFile(minedBlockHeader, coinbaseTransaction, txids);

console.log('Block mined successfully!');