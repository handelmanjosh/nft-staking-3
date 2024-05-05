import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NftStaking3 } from "../target/types/nft_staking_3";
import { TOKEN_PROGRAM_ID, createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount, getAssociatedTokenAddress, getAssociatedTokenAddressSync, createAssociatedTokenAccount, transfer } from "@solana/spl-token";
import { assert, expect } from "chai";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from 'fs';
function functionalIncludes<T>(l: T[], f: (t: T) => boolean): boolean {
  for (const item of l){
    if (f(item)) return true;
  }
  return false;
}
function getIndex<T>(l: T[], f: (t: T) => boolean): number {
  for (let i = 0; i < l.length; i++) {
    if (f(l[i])) return i;
  }
  return -1;
}
async function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  })
}
describe("nft-staking-3", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();

  anchor.setProvider(provider);

  const program = anchor.workspace.NftStaking3 as Program<NftStaking3>;
  const wallet = provider.wallet as anchor.Wallet;
  const [programTokenAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("mint")],
    program.programId,
  );
  const [programAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("auth")],
    program.programId,
  );
  let mint: PublicKey;
  const setupToken = async () => {
    const m = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      9
    );
    mint = m;
    const userTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      m,
      wallet.publicKey,
    );
    await mintTo(
      provider.connection,
      wallet.payer,
      m,
      userTokenAccount,
      wallet.payer,
      1000000 * 10**9
    )
  }
  const initialize = async () => {
    const tx = await program.methods.initialize().accounts({
      programTokenAccount,
      mint,
      programAuthority,
    }).signers([wallet.payer]).rpc();
  }
  it("Is initialized!", async () => {
    await setupToken();
    await initialize();
    const progAccountData = await getAccount(provider.connection, programTokenAccount);
    assert(progAccountData.amount === BigInt(0), "Program account has token");
    const userTokenAccount = getAssociatedTokenAddressSync(mint, wallet.publicKey);
    const userTokenAccountData = await getAccount(provider.connection, userTokenAccount);
    assert(userTokenAccountData.amount === BigInt(1000000 * 10**9), "user did not get token");
  });
  it("funds program account successfully", async () => {
    const userTokenAccount = getAssociatedTokenAddressSync(mint, wallet.publicKey);
    let amount = 500000 * 10**9;
    await program.methods.fund(new anchor.BN(amount)).accounts({
      userTokenAccount,
      user: wallet.publicKey,
      programTokenAccount,
    }).signers([wallet.payer]).rpc();
    let programTokenAccountData = await getAccount(provider.connection, programTokenAccount);
    assert(programTokenAccountData.amount === BigInt(amount), "program token account did not get token");
    let userTokenAccountData = await getAccount(provider.connection, userTokenAccount);
    assert(userTokenAccountData.amount === BigInt(amount), "user token account has wrong amount of token");
  })
  it("can create and view account info", async () => {
    let user = Keypair.generate();
    const tx = await provider.connection.requestAirdrop(user.publicKey, 10 * LAMPORTS_PER_SOL);
    await timeout(1000);
    let userTokenAccount = getAssociatedTokenAddressSync(
      mint,
      user.publicKey
    );
    let accountInfo = await provider.connection.getAccountInfo(userTokenAccount);
    assert(!accountInfo, "account defined");
    await program.methods.createAssociatedTokenAccount().accounts({
      user: user.publicKey,
      mint,
      associatedTokenAccount: userTokenAccount
    }).signers([user]).rpc();
    accountInfo = await provider.connection.getAccountInfo(userTokenAccount);
    assert(accountInfo, "account not defined");
  })
  const mintNFT = async () => {
    // const symbols = ["CLB", "UG", "GOTM", "GREATGOATS", "CNDY"];
    // const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    // const { nft: nftCollection } = await metaplex.nfts().create({
    //   name: "NFT Collection",
    //   symbol,
    //   sellerFeeBasisPoints: 500,
    //   uri: "",
    //   isCollection: true,
    // });
    // const { nft } = await metaplex.nfts().create({
    //   name: "NFT #1",
    //   symbol, 
    //   collection: nftCollection.address,
    //   uri: "",
    //   sellerFeeBasisPoints: 500,
    // });
    // const nftAccount = await getOrCreateAssociatedTokenAccount(
    //   provider.connection,
    //   wallet.payer,
    //   nft.address,
    //   wallet.publicKey
    // );
    
    const nftMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      0
    );
    const nftAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      nftMint,
      wallet.publicKey,
    );
    await mintTo(
      provider.connection,
      wallet.payer,
      nftMint,
      nftAccount.address,
      wallet.payer,
      1
    );
    const [stakeAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), wallet.publicKey.toBuffer()],
      program.programId,
    );
    const [stakeTokenAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("stake_account"), wallet.publicKey.toBuffer(), nftMint.toBuffer()],
      program.programId,
    )
    return { nftMint, nftAccount, stakeAccount, stakeTokenAccount };
  }
  const stake = async (size: number) => {
    const { nftMint, nftAccount, stakeAccount, stakeTokenAccount } = await mintNFT();
    // const metadata = ""//await metaplex.nfts().findByMint({mintAddress: nftMint});
    const tx = await program.methods.stake(0, new anchor.BN(size)).accounts({
      stakeAccount,
      stakeTokenAccount,
      user: wallet.publicKey,
      nftAccount: nftAccount.address,
      programAuthority,
      mint: nftMint
    }).signers([wallet.payer]).rpc();
    return { nftMint, nftAccount, stakeAccount, stakeTokenAccount };
  }
  it("can stake single nft", async () => {
    const { nftMint, nftAccount, stakeAccount, stakeTokenAccount } = await mintNFT();


    const tx = await program.methods.stake(0, new anchor.BN(0)).accounts({
      stakeAccount,
      stakeTokenAccount,
      user: wallet.publicKey,
      nftAccount: nftAccount.address,
      programAuthority,
      mint: nftMint
    }).signers([wallet.payer]).rpc();
    // const account = await program.account.stakeInfo.fetch(stakeAccount);
    // console.log(account);
  });
  it("can stake multiple nfts", async () =>{
    const [stakeAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), wallet.publicKey.toBuffer()],
      program.programId,
    );
    await stake(1);
    await stake(2);
  });
  it("fails when smaller number is passed in", async () => {
    try {
      await stake(1);
      throw Error("womp");
    } catch (e: any) {
      if (e.message === "womp") {
        throw new Error("code succeeded");
      }
      //console.error(e);
    }
  });
  it("stakes and unstakes", async () => {
    let [stakeAccount] = anchor.web3.PublicKey.findProgramAddressSync(
       [Buffer.from("stake"), wallet.publicKey.toBuffer()],
       program.programId
     );
     const accountData = await program.account.stakeInfo.fetch(stakeAccount);
     const { nftMint } = await stake(accountData.mints.length);
     await stake(accountData.mints.length + 1);
     const accountData2 = await program.account.stakeInfo.fetch(stakeAccount);
     const accountDataAfter = await program.account.stakeInfo.fetch(stakeAccount);
     assert(accountDataAfter.mints.length > accountData.mints.length);
    const [stakeTokenAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("stake_account"), wallet.publicKey.toBuffer(), nftMint.toBuffer()],
      program.programId
    );
    const userTokenAccount = getAssociatedTokenAddressSync(
      mint, 
      wallet.publicKey
    );
    const nftAccount = getAssociatedTokenAddressSync(nftMint, wallet.publicKey);
    // const programBalance = await getAccount(provider.connection, programTokenAccount);
    // console.log(programBalance.amount);
    const accounts = (await program.account.stakeInfo.all())[0];
    const myIndex = getIndex(accounts.account.mints, (m) => m.equals(nftMint));
    const now = Date.now();
    const diff = BigInt(now) - BigInt(accounts.account.stakedTimes[myIndex].toString()) * BigInt(1000)
    // console.log({myIndex, time: accounts.account.stakedTimes[myIndex].toString(), diff})
    await program.methods.unstake().accounts({
      stakeAccount,
      stakeTokenAccount,
      nftAccount,
      programAuthority,
      programTokenAccount,
      user: wallet.publicKey,
      userTokenAccount,
    }).signers([wallet.payer]).rpc();
    await timeout(500);
    const token = await getAccount(provider.connection, userTokenAccount);
    assert(token.amount > 0, "user did not get any token");
    const tokenAcc = await getAccount(provider.connection, stakeTokenAccount);
    assert(tokenAcc.amount === BigInt(0), "Program still has nft token");
    const account = await program.account.stakeInfo.fetch(stakeAccount);
    fs.writeFileSync("file.json", JSON.stringify({account, accountData, accountData2, nftMint, nftAccount}));
    assert(account.mints.length === accountData.mints.length + 1, "did not stake 2 then unstake 1 nft");
    assert(account.mints.length === accountData2.mints.length - 1, "Removed a mint");
    assert(!functionalIncludes(account.mints, (mint) => {
      return mint.equals(nftMint);
    }), "Account still includes nft mint");
  });
  it("claims multiple", async () => {
    let [stakeAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), wallet.publicKey.toBuffer()],
      program.programId
    );
    const [programAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("auth")],
      program.programId,
    );
    let accountData = await program.account.stakeInfo.fetch(stakeAccount);
    let start = accountData.mints.length;
    for (let i = 0; i < 3; i++) {
      await stake(start + i);
    }
    const userTokenAccount = getAssociatedTokenAddressSync(
      mint, 
      wallet.publicKey
    );
    accountData = await program.account.stakeInfo.fetch(stakeAccount);
    let remainingAccounts = []
    for (const mint of accountData.mints) {
      remainingAccounts.push({
        pubkey: getAssociatedTokenAddressSync(mint, wallet.publicKey),
        isWriteable: false,
        isSigner: false
      });
    }
    await program.methods.claim().accounts({
      stakeAccount,
      user: wallet.publicKey,
      userTokenAccount,
      programTokenAccount,
    }).remainingAccounts(remainingAccounts).rpc();
    accountData = await program.account.stakeInfo.fetch(stakeAccount);
    const bigints = accountData.stakedTimes.map((d) => BigInt(d.toString()));
    const bools = bigints.reduce((prev, curr) => {
      return [curr, prev[1] && prev[0] == curr]
    }, [bigints[0], true])
    assert(bools, "everything not equal");
  });
  it("should fail to claim when wrong amount of claim accounts are passed in", async () => {
    try {
      let [stakeAccount] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), wallet.publicKey.toBuffer()],
        program.programId
      );
      const userTokenAccount = getAssociatedTokenAddressSync(
        mint, 
        wallet.publicKey
      );
      await program.methods.claim().accounts({
        stakeAccount,
        user: wallet.publicKey,
        userTokenAccount,
        programTokenAccount
      }).remainingAccounts([]).rpc()
      throw new Error("womp");
    } catch (e: any) {
      if (e.message === "womp") {
        throw new Error("failed");
      }
    }
  });
  it("Should fail to claim if wrong owner or wrong mint on remaining accounts", async () => {
    let [stakeAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), wallet.publicKey.toBuffer()],
      program.programId
    );
    const userTokenAccount = getAssociatedTokenAddressSync(
      mint, 
      wallet.publicKey
    );
    const accountData = await program.account.stakeInfo.fetch(stakeAccount);
    const remainingAccounts = [];
    for (const mint of accountData.mints) {
      remainingAccounts.push({
        pubkey: getAssociatedTokenAddressSync(mint, wallet.publicKey),
        isWriteable: false,
        isSigner: false
      });
    }
    const keypair = Keypair.generate();
    try {
      remainingAccounts[1] = {
        pubkey: getAssociatedTokenAddressSync(mint, keypair.publicKey),
        isWriteable: false,
        isSigner: false,
      }
      await program.methods.claim().accounts({
        stakeAccount,
        user: wallet.publicKey,
        userTokenAccount,
        programTokenAccount,
      }).remainingAccounts(remainingAccounts).rpc()
      throw new Error("womp")
    } catch (e) {
      if (e.message === "womp") {
        throw new Error("did not error on wrong owner");
      }
    }
    try {
      
      remainingAccounts[1] = {
        pubkey: getAssociatedTokenAddressSync(keypair.publicKey, wallet.publicKey),
        isWriteable: false,
        isSigner: false,
      }
      await program.methods.claim().accounts({
        stakeAccount,
        user: wallet.publicKey,
        userTokenAccount,
        programTokenAccount,
      }).remainingAccounts(remainingAccounts).rpc()
      throw new Error("womp")
    } catch (e) {
      if (e.message === "womp") {
        throw new Error("did not error");
      }
    }
  });
  it("should silently fail and delete missing stake if user does not have balance for that stake, should succeed if stake again", async () => {
    let [stakeAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), wallet.publicKey.toBuffer()],
      program.programId
    );
    let accountData = await program.account.stakeInfo.fetch(stakeAccount);
    const userTokenAccount = getAssociatedTokenAddressSync(
      mint, 
      wallet.publicKey
    );
    const other = Keypair.generate();
    const { nftMint, nftAccount } = await stake(accountData.mints.length);
    let nftAccountData = await getAccount(provider.connection, nftAccount.address);
    assert(nftAccountData.amount === BigInt(1), "Nft account has no nft");
    const otherNftAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      nftMint,
      other.publicKey
    );
    await transfer(
      provider.connection,
      wallet.payer,
      nftAccount.address,
      otherNftAccount.address,
      wallet.payer,
      1
    );
    await timeout(500);
    let userAccountData = await getAccount(provider.connection, nftAccount.address);
    assert(userAccountData.amount === BigInt(0), "Token not transferred");
    const accountDataBefore = await program.account.stakeInfo.fetch(stakeAccount);
    // console.log(accountDataBefore.mints.map(String));
    const remainingAccounts = [];
    for (const mint of accountDataBefore.mints) {
      remainingAccounts.push({
        pubkey: getAssociatedTokenAddressSync(mint, wallet.publicKey),
        isWriteable: false,
        isSigner: false,
      });
    }
    await program.methods.claim().accounts({
      stakeAccount,
      user: wallet.publicKey,
      userTokenAccount,
      programTokenAccount,
    }).remainingAccounts(remainingAccounts).rpc({skipPreflight: true});
    await timeout(500);
    const accountDataAfter = await program.account.stakeInfo.fetch(stakeAccount);
    // console.log(accountDataAfter.mints.map(String));
    assert(accountDataAfter.mints.length < accountDataBefore.mints.length, "Did not remove faulty mint");
    const size = accountDataAfter.mints.length;
    await stake(size);
  });
});
