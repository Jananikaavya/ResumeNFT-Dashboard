import React, { useState } from "react";
import axios from "axios";
import { ethers } from "ethers";
import AdvancedResumeNFTABI from "./AdvancedResumeNFT.json";
import "./NFTDashboard.css";


const CONTRACT_ADDRESS = "0xD008F88ecB1735430d2d6B0D97C230AE9f372a27";

const NFTDashboard = () => {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [status, setStatus] = useState("");
  const [resumes, setResumes] = useState([]);

  const [resumeFile, setResumeFile] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [skills, setSkills] = useState("");
  const [experience, setExperience] = useState("");

  /* ================= CONNECT WALLET ================= */
  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert("MetaMask not found");
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();

      const contractInstance = new ethers.Contract(
        CONTRACT_ADDRESS,
        AdvancedResumeNFTABI,
        signer
      );

      const owner = await contractInstance.owner();

      if (signerAddress.toLowerCase() !== owner.toLowerCase()) {
        setStatus("❌ Please connect using the contract owner account");
        return;
      }

      setAccount(signerAddress);
      setContract(contractInstance);
      setStatus("✅ Connected as owner");

      await loadResumes(contractInstance, signerAddress);
    } catch (err) {
      console.error(err);
      setStatus("❌ Wallet connection failed");
    }
  };

  /* ================= LOAD OLD + NEW NFTs ================= */
  const loadResumes = async (contractInstance, user) => {
    try {
      const tokenIds = await contractInstance.getUserResumes(user);

      const detailedResumes = await Promise.all(
        tokenIds.map(async (id) => {
          let meta = {};
          let tokenURI = "";

          try {
            tokenURI = await contractInstance.tokenURI(id);
            const gatewayURL = tokenURI.replace(
              "ipfs://",
              "https://ipfs.io/ipfs/"
            );
            const res = await fetch(gatewayURL);
            meta = await res.json();
          } catch {
            console.warn("Old NFT detected (no metadata)");
          }

          return {
            tokenId: id.toString(),
            name: meta.name || "Resume NFT",
            description: meta.description || "No description",
            skills: meta.skills || [],
            experience: meta.experience || [],
            pdf: meta.pdf
              ? meta.pdf.replace("ipfs://", "https://ipfs.io/ipfs/")
              : tokenURI
              ? tokenURI.replace("ipfs://", "https://ipfs.io/ipfs/")
              : null,
            active: true
          };
        })
      );

      setResumes(detailedResumes);
    } catch (err) {
      console.error(err);
      setStatus("❌ Failed to load resumes");
    }
  };

  /* ================= UPLOAD & MINT ================= */
  const handleUploadResume = async (e) => {
    e.preventDefault();

    if (!resumeFile || !name) {
      alert("Resume file and name required");
      return;
    }

    try {
      setStatus("📤 Uploading to IPFS...");

      const formData = new FormData();
      formData.append("resume", resumeFile);
      formData.append("name", name);
      formData.append("description", description);
      formData.append("skills", JSON.stringify(skills.split(",")));
      formData.append("experience", JSON.stringify([{ role: experience }]));

      const res = await axios.post(
        "http://localhost:5000/upload-resume",
        formData
      );

      const tokenURI = `ipfs://${res.data.cid}`;

      setStatus("⛓️ Minting NFT...");
      const tx = await contract.mintResume(account, tokenURI);
      await tx.wait();

      setStatus("✅ Resume NFT minted!");
      await loadResumes(contract, account);
    } catch (err) {
      console.error(err);
      setStatus("❌ Minting failed");
    }
  };

  return (
    <div className="upload-resume-container">
      <h2>📄 Resume NFT Dashboard</h2>

      {!account && (
        <button onClick={connectWallet}>Connect MetaMask (Owner)</button>
      )}

      {account && (
        <>
          <h3>Upload Resume</h3>
          <form onSubmit={handleUploadResume}>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setResumeFile(e.target.files[0])}
            />
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <input
              type="text"
              placeholder="Skills (comma separated)"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
            />
            <input
              type="text"
              placeholder="Experience"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
            />
            <button type="submit">Upload & Mint</button>
          </form>

          <h3>Your Resumes</h3>

          {resumes.length === 0 && <p>No resumes found</p>}

          {resumes.map((r) => (
            <div key={r.tokenId} className="resume-card">
              <h4>🆔 Token #{r.tokenId}</h4>
              <p><b>Name:</b> {r.name}</p>
              <p><b>Description:</b> {r.description}</p>
              <p>
                <b>Skills:</b>{" "}
                {r.skills.length ? r.skills.join(", ") : "Not provided"}
              </p>
              <p>
                <b>Experience:</b>{" "}
                {r.experience.length
                  ? r.experience.map((e) => e.role).join(", ")
                  : "Not provided"}
              </p>
              <p><b>Status:</b> ✅ Active</p>

              {r.pdf && (
                <a href={r.pdf} target="_blank" rel="noreferrer">
                  📄 View Resume
                </a>
              )}
            </div>
          ))}

          <p>{status}</p>
        </>
      )}
    </div>
  );
};

export default NFTDashboard;
