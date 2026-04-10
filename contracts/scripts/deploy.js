import hre from "hardhat";

async function main() {
  const VeritasTrust = await hre.ethers.getContractFactory("VeritasTrust");
  const contract = await VeritasTrust.deploy();
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log("VeritasTrust deployed to:", addr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

