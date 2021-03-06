import crypto from "crypto";
import { default as poseidon } from "circomlib/src/poseidon";
import { bufferToBigInt } from "./helpers";

// Creates a Merkle proof through an imaginary tree of arbitrary depth for testing

type Proof = {
  isRightNode: boolean;
  otherDigest: BigInt;
}[];

export default function fakeMerkleProof(leaf: bigint, levels: number): [BigInt, Proof] {
  let proof: Proof = [];
  let root: bigint = leaf;

  for (let i = 0; i < levels; i++) {
    let otherDigest = bufferToBigInt(crypto.randomBytes(32));
    const isRightNode = otherDigest % BigInt(2) === BigInt(0);
    const newDigest = isRightNode ? poseidon([root, otherDigest]) : poseidon([otherDigest, root]);

    proof.push({ isRightNode, otherDigest });

    root = newDigest;
  }

  return [root, proof];
}
