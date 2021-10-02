import { PrivateKey, PublicKey } from "babyjubjub";
import { default as poseidon } from "circomlib/src/poseidon";
import { initialize } from "zokrates-js";
import fakeMerkleProof from "./fakeMerkleProof";
import { numToZok, stringToNum } from "./helpers";
import raw from "raw.macro";

// Example inputs

// The ID of the app that we'll be provide a proof to
const APP_ID = "https://www.startupschool.org";

// In practice this should be randomly generated by the app as part of each
// authentication request.
const NONCE = 12345;

// The number of private aliases that the app allows for each user. `1` means
// each user can only create one account.
const MAX_ALIASES = 1;

// The FixedID of the authenticating user.
const FIXED_ID = 1318;

// The user's immutable "password". If a user has to change their private key,
// they can recover access to FixedID authenticated accounts as long as they
// remember their password. An app that learns a user's password may be able to
// de-anonymize them (but still cannot impersonate them).
const PASSWORD = "moloch";

// Keypair on BabyJubJub to prove ownership. Ideally, the private key would be
// derived from the user's wallet's private key so they don't have to keep track
// of another secret. For now, we'll just generate one randomly.
const PRIV_KEY = PrivateKey.getRandObj().field;
const PUB_KEY = PublicKey.fromPrivate(new PrivateKey(PRIV_KEY));

// Users can create multiple distinct aliases for each app as long as they all
// have distinct `AliasId`s. An app can limit users to N aliases by only
// permitting proofs that show the `AliasId` is less than N. An ap that wants to
// enforce one account per human can require AliasId to always be 0.
const ALIAS_ID = 0;

// The ZoKrates proof doesn't allow for function parameters of unknown length,
// so we need to tell it the maximum number of steps in the Merkle proof. This
// binds the maximum size of the tree to 2 ** MERKLE_TREE_MAX_DEPTH. This
// parameter needs to be kept in sync with the N in MerkleProofStep[N] on the
// ZoKrates side.
const MERKLE_TREE_MAX_DEPTH = 33;

// The app token is a persistent ID derived from your FixedID and the app you're
// signing into. Since it doesn't depend on your public key, it allows for
// transparent account recovery.
const appToken = poseidon([FIXED_ID, stringToNum(APP_ID), stringToNum(PASSWORD), ALIAS_ID]);

const hashedPassword = poseidon([stringToNum(PASSWORD)]);

// This leaf will live in the Merkle tree of active users maintained by a smart
// contract. Everything in it is public knowledge.
const pubKeyCombined = BigInt(PUB_KEY.p.x.n.plus(PUB_KEY.p.y.n).toFixed());

console.log("Generating the user's leaf node");
const myLeaf = poseidon([FIXED_ID, pubKeyCombined, hashedPassword]);

let merkleProof = [];

console.log("Generating a fake Merkle proof");
const [merkleRoot, proof] = fakeMerkleProof(myLeaf, 33);
merkleProof = proof.map((step) => ({
  ...step,
  otherDigest: numToZok(step.otherDigest),
}));

if (merkleProof.length > MERKLE_TREE_MAX_DEPTH) {
  throw `Error: tree is larger than MERKLE_TREE_MAX_DEPTH permits (${merkleProof.length} > ${MERKLE_TREE_MAX_DEPTH})`;
} else if (merkleProof.length < MERKLE_TREE_MAX_DEPTH) {
  // Dummy proof steps to pad out the `merkleProof` array to the expected length.
  merkleProof = merkleProof.concat(
    Array(MERKLE_TREE_MAX_DEPTH - merkleProof.length).fill({
      isRightNode: true,
      otherDigest: "0",
    })
  );
}

async function main() {
  const zok = await initialize();

  const source = raw("./proof.zok");

  console.log("Compiling contract");
  const artifacts = zok.compile(source);

  console.log("Computing the witness");
  const { witness, output } = zok.computeWitness(artifacts, [
    numToZok(merkleRoot),
    numToZok(stringToNum(APP_ID)),
    numToZok(NONCE),
    numToZok(MAX_ALIASES),
    numToZok(appToken),
    [PUB_KEY.p.x.n.toFixed(), PUB_KEY.p.y.n.toFixed()],
    numToZok(FIXED_ID),
    PRIV_KEY.n.toFixed(),
    numToZok(stringToNum(PASSWORD)),
    numToZok(ALIAS_ID),
    merkleProof,
  ]);

  console.log("Generating the keypair");
  const keypair = zok.setup(artifacts.program);

  console.log("Generating the proof", new Date());
  const start = new Date();
  const proof = zok.generateProof(artifacts.program, witness, keypair.pk);
  console.log("Valid proof generated", new Date());
  alert(`Proof took ${(new Date() - start) / 1000}`);

  console.log("Exporting the verifier");
  const verifier = zok.exportSolidityVerifier(keypair.vk, "v1");

  console.log("Done!");
}

main().catch(console.error);
