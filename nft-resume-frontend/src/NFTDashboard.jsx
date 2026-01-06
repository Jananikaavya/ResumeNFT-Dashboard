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

  // 🔥 ULTIMATE IPFS URL FIX - Handles ALL malformed cases
  const cleanIpfsUrl = (dirtyUrl) => {
    if (!dirtyUrl) return null;
    
    // Remove ALL "ipfs://" prefixes (handles double/triple prefixes)
    let cleanCID = dirtyUrl.replace(/^(?:ipfs:\/\/)+/gi, '');
    
    // Remove any leading slashes
    cleanCID = cleanCID.replace(/^\/+/, '');
    
    // Remove trailing slashes
    cleanCID = cleanCID.replace(/\/+$/, '');
    
    console.log(`🧹 Cleaned CID: ${cleanCID}`);
    return `https://gateway.pinata.cloud/ipfs/${cleanCID}`;
  };

  const connectWallet = async () => {
    try {
      if (!window.ethereum) return alert("Install MetaMask");
      
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
        return setStatus("❌ Connect owner account");
      }

      setAccount(signerAddress);
      setContract(contractInstance);
      setStatus("✅ Connected as owner");
      loadResumes(contractInstance, signerAddress);
    } catch (err) {
      setStatus("❌ Connection failed");
    }
  };

  const loadResumes = async (contractInstance, user) => {
    try {
      setStatus("🔄 Loading resumes...");
      const tokenIds = await contractInstance.getUserResumes(user);
      
      const detailedResumes = await Promise.all(
        tokenIds.map(async (id) => {
          let meta = {};
          let rawTokenURI = "";
          
          try {
            rawTokenURI = await contractInstance.tokenURI(id);
            console.log(`📄 Raw tokenURI ${id}:`, rawTokenURI);
            
            const gatewayURL = cleanIpfsUrl(rawTokenURI);
            console.log(`🌐 Gateway URL ${id}:`, gatewayURL);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const res = await fetch(gatewayURL, { 
              signal: controller.signal,
              headers: { 'Accept': 'application/json' }
            });
            
            clearTimeout(timeoutId);
            
            if (res.ok) {
              meta = await res.json();
              console.log(`✅ Metadata LOADED ${id}:`, meta.name);
            } else {
              console.warn(`❌ Metadata ${id} failed: ${res.status}`);
            }
          } catch (err) {
            console.warn(`⚠️ No metadata token ${id}:`, err.message);
          }

          let pdfUrl = null;
          if (meta.resumePDF) {
            pdfUrl = cleanIpfsUrl(meta.resumePDF);
            console.log(`✅ PDF found for ${id}:`, pdfUrl);
          } else if (meta.pdf) {
            pdfUrl = cleanIpfsUrl(meta.pdf);
          }

          return {
            tokenId: id.toString(),
            name: meta.name || `Resume NFT #${id}`,
            description: meta.description || "Resume metadata unavailable",
            skills: Array.isArray(meta.skills) ? meta.skills : [],
            experience: Array.isArray(meta.experience) ? meta.experience : [],
            pdf: pdfUrl,
            rawTokenURI,
            hasMetadata: !!meta.name,
            active: true
          };
        })
      );

      setResumes(detailedResumes);
      setStatus(`✅ Loaded ${detailedResumes.length} resumes`);
    } catch (err) {
      console.error("Load error:", err);
      setStatus("❌ Failed to load resumes");
    }
  };

  const handleUploadResume = async (e) => {
    e.preventDefault();
    if (!resumeFile || !name.trim()) return alert("File & name required");

    try {
      setStatus("📤 Uploading to IPFS...");
      
      const formData = new FormData();
      formData.append("resume", resumeFile);
      formData.append("name", name.trim());
      formData.append("description", description.trim());
      formData.append("skills", JSON.stringify(skills.split(",").map(s => s.trim()).filter(Boolean)));
      formData.append("experience", JSON.stringify(experience.trim() ? [{ role: experience.trim() }] : []));

      const res = await axios.post("http://localhost:5000/upload-resume", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000
      });

      const tokenURI = `ipfs://${res.data.metadataCID}`; // ✅ Single prefix for NEW uploads
      setStatus("⛓️ Minting NFT...");
      
      const tx = await contract.mintResume(account, tokenURI);
      await tx.wait();

      setStatus("✅ New resume minted!");
      setResumeFile(null); setName(""); setDescription(""); 
      setSkills(""); setExperience("");
      await loadResumes(contract, account);
    } catch (err) {
      setStatus(`❌ ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div className="dashboard">
      <h1>📄 Resume NFT Dashboard</h1>
      
      {!account ? (
        <button onClick={connectWallet} className="connect-btn">
          🔗 Connect MetaMask (Owner)
        </button>
      ) : (
        <>
          <div className="upload-section">
            <h2>➕ Upload New Resume</h2>
            <form onSubmit={handleUploadResume} className="upload-form">
              <input type="file" accept="application/pdf" onChange={(e) => setResumeFile(e.target.files[0])} required />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name *" required />
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Summary" />
              <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Skills (comma separated)" />
              <input value={experience} onChange={(e) => setExperience(e.target.value)} placeholder="Experience" />
              <button type="submit" disabled={!resumeFile || !name.trim()}>
                🚀 Upload & Mint
              </button>
            </form>
          </div>

          <div className="resumes-section">
            <h2>📋 Your Resumes ({resumes.length})</h2>
            {resumes.length === 0 ? (
              <p>No resumes found. Upload your first one!</p>
            ) : (
              <div className="resumes-grid">
                {resumes.map((r) => (
                  <div key={r.tokenId} className="resume-card">
                    <div className="card-header">
                      <h3>🆔 #{r.tokenId}</h3>
                      <span className={r.hasMetadata ? "status-good" : "status-warning"}>
                        {r.hasMetadata ? "✅ Full Data" : "⚠️ Legacy NFT"}
                      </span>
                    </div>
                    <p><strong>Name:</strong> {r.name}</p>
                    <p><strong>Description:</strong> {r.description}</p>
                    {r.skills.length > 0 && <p><strong>Skills:</strong> {r.skills.join(", ")}</p>}
                    
                    {r.pdf ? (
                      <a href={r.pdf} target="_blank" className="pdf-btn" rel="noreferrer">
                        📄 View Resume PDF
                      </a>
                    ) : (
                      <p className="no-pdf">No PDF available</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {status && <div className="status">{status}</div>}
    </div>
  );
};

export default NFTDashboard;

