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

function verifySignature(transaction) {
  for (const input of transaction.vin) {
    const { scriptSig, txid, vout } = input;
    const { scriptPubKey } = input.prevout;
    const message = Buffer.from(txid, 'hex');
    const signature = Buffer.from(scriptSig, 'hex');
    const publicKey = Buffer.from(scriptPubKey.slice(2), 'hex');
    if (!secp256k1.ecdsaVerify(signature, message, publicKey)) {
      return false;
    }
  }
  return true;
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

  // Verify input signatures
  if (!verifySignature(transaction)) {
    return false;
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
          hex: `76a914${minerAddress}88ac`,
          address: minerAddress,
        },
      },
    ],
  };

  return transaction;
}

function serializeTransaction(transaction) {
  const buffer = Buffer.alloc(4 + 1 + transaction.vin.length * 41 + 1 + transaction.vout.length * 31);
  let offset = 0;

  // Write version
  buffer.writeUInt32LE(transaction.version, offset);
  offset += 4;

  // Write number of inputs
  buffer.writeUInt8(transaction.vin.length, offset);
  offset += 1;

  // Write inputs
  for (const input of transaction.vin) {
    if (input.txid) {
      Buffer.from(input.txid, 'hex').copy(buffer, offset);
      offset += 32;
    } else {
      buffer.fill(0, offset, offset + 32);
      offset += 32;
    }
    
    if (input.vout !== undefined) {
      buffer.writeUInt32LE(input.vout, offset);
      offset += 4;
    } else {
      buffer.writeUInt32LE(0xffffffff, offset);
      offset += 4;
    }
    
    if (input.scriptSig) {
      const scriptSig = Buffer.from(input.scriptSig, 'hex');
      buffer.writeUInt8(scriptSig.length, offset);
      offset += 1;
      scriptSig.copy(buffer, offset);
      offset += scriptSig.length;
    } else {
      buffer.writeUInt8(0, offset);
      offset += 1;
    }
    
    buffer.writeUInt32LE(input.sequence, offset);
    offset += 4;
  }

  // Write number of outputs
  buffer.writeUInt8(transaction.vout.length, offset);
  offset += 1;

  // Write outputs
  for (const output of transaction.vout) {
    if (output.value !== undefined) {
      buffer.writeBigInt64LE(BigInt(output.value), offset);
      offset += 8;
    } else {
      buffer.writeBigInt64LE(BigInt(0), offset);
      offset += 8;
    }
    
    if (output.scriptPubKey && output.scriptPubKey.hex) {
      const scriptPubKey = Buffer.from(output.scriptPubKey.hex, 'hex');
      buffer.writeUInt8(scriptPubKey.length, offset);
      offset += 1;
      scriptPubKey.copy(buffer, offset);
      offset += scriptPubKey.length;
    } else {
      buffer.writeUInt8(0, offset);
      offset += 1;
    }
  }

  return buffer.toString('hex');
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

  while (hash > difficulty) {
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
coinbaseTransaction.txid = crypto.createHash('sha256').update(Buffer.from(serializeTransaction(coinbaseTransaction), 'hex')).digest('hex');

validTransactions.forEach(tx => {
  tx.txid = crypto.createHash('sha256').update(Buffer.from(serializeTransaction(tx), 'hex')).digest('hex');
});

const merkleRoot = calculateMerkleRoot([coinbaseTransaction, ...validTransactions]);
const blockHeader = createBlockHeader(1, '0000000000000000000000000000000000000000000000000000000000000000', merkleRoot, Math.floor(Date.now() / 1000), DIFFICULTY_TARGET, 0);
const minedBlockHeader = mineBlock(blockHeader, DIFFICULTY_TARGET);

const txids = [coinbaseTransaction.txid, ...validTransactions.map(tx => tx.txid)];
writeTxidsToFile(minedBlockHeader, coinbaseTransaction, txids);

console.log('Block mined successfully!');