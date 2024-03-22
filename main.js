const fs = require('fs');
const crypto = require('crypto');
const secp256k1 = require('secp256k1');

const DIFFICULTY_TARGET = '0000ffff00000000000000000000000000000000000000000000000000000000';
const BLOCK_REWARD = 50;

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
    if (!input.txid || input.vout === undefined || !input.scriptSig || !input.sequence) {
      return false;
    }
  }

  // Check transaction outputs
  for (const output of transaction.vout) {
    if (output.value === undefined || !output.scriptPubKey) {
      return false;
    }
  }

  for (const input of transaction.vin) {
    if (!verifySignature(input)) {
      return false;
    }
  }

  return true;
}

function createCoinbaseTransaction(blockHeight, minerAddress) {
  const coinbaseScript = Buffer.alloc(8);
  coinbaseScript.writeInt32LE(blockHeight, 0);

  const transaction = {
    version: 1,
    vin: [
      {
        prevout: {
          hash: '0000000000000000000000000000000000000000000000000000000000000000',
          index: 0xffffffff,
        },
        scriptSig: coinbaseScript.toString('hex'),
        sequence: 0xffffffff,
      },
    ],
    vout: [
      {
        value: BLOCK_REWARD,
        scriptPubKey: {
          asm: `OP_DUP OP_HASH160 ${minerAddress} OP_EQUALVERIFY OP_CHECKSIG`,
          hex: '',
          address: minerAddress,
        },
      },
    ],
  };

  return transaction;
}

function serializeTransaction(transaction) {
  return JSON.stringify(transaction);
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
  const hash = crypto.createHash('sha256').update(Buffer.from(serializedHeader, 'hex')).digest('hex');
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
  const txids = transactions.map(tx => tx.txid);

  while (txids.length > 1) {
    const newTxids = [];
    for (let i = 0; i < txids.length; i += 2) {
      const left = txids[i];
      const right = i + 1 < txids.length ? txids[i + 1] : left;
      const combined = Buffer.concat([Buffer.from(left, 'hex'), Buffer.from(right, 'hex')]);
      const hash = crypto.createHash('sha256').update(combined).digest('hex');
      newTxids.push(hash);
    }
    txids = newTxids;
  }

  return txids[0];
}

function writeTxidsToFile(blockHeader, coinbaseTransaction, txids) {
  const outputFile = 'output.txt';
  const serializedBlockHeader = serializeBlockHeader(blockHeader);
  const serializedCoinbaseTransaction = serializeTransaction(coinbaseTransaction);
  const content = `${serializedBlockHeader}\n${serializedCoinbaseTransaction}\n${txids.join('\n')}`;
  fs.writeFileSync(outputFile, content);
}

// Main script flow
const transactions = readTransactionsFromMempool();
const validTransactions = transactions.filter(validateTransaction);

const coinbaseTransaction = createCoinbaseTransaction(1, '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
coinbaseTransaction.txid = crypto.createHash('sha256').update(serializeTransaction(coinbaseTransaction)).digest('hex');

const merkleRoot = calculateMerkleRoot([coinbaseTransaction, ...validTransactions]);
const blockHeader = createBlockHeader(1, '0000000000000000000000000000000000000000000000000000000000000000', merkleRoot, Math.floor(Date.now() / 1000), DIFFICULTY_TARGET, 0);
const minedBlockHeader = mineBlock(blockHeader, DIFFICULTY_TARGET);

const txids = [coinbaseTransaction.txid, ...validTransactions.map(tx => tx.txid)];
writeTxidsToFile(minedBlockHeader, coinbaseTransaction, txids);

console.log('Block mined successfully!');