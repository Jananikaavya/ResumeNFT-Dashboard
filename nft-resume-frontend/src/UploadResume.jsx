import React, { useState } from "react";
import axios from "axios";
import "./UploadResume.css";

const UploadResume = ({ contract, account, reload }) => {
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [skills, setSkills] = useState("");
  const [experience, setExperience] = useState("");
  const [status, setStatus] = useState("");

  const uploadResume = async (e) => {
    e.preventDefault();

    if (!file || !name) {
      alert("Resume PDF & Name required");
      return;
    }

    try {
      setStatus("📤 Uploading to IPFS...");

      const formData = new FormData();
      formData.append("resume", file);
      formData.append("name", name);
      formData.append("skills", JSON.stringify(skills.split(",")));
      formData.append(
        "experience",
        JSON.stringify([{ role: experience }])
      );

      const res = await axios.post(
        "http://localhost:5000/upload-resume",
        formData
      );

      const tokenURI = `ipfs://${res.data.cid}`;

      setStatus("⛓ Minting Resume NFT...");
      const tx = await contract.mintResume(account, tokenURI);
      await tx.wait();

      setStatus("✅ Resume NFT Minted");
      reload();
    } catch (err) {
      console.error(err);
      setStatus("❌ Minting failed");
    }
  };

  return (
    <div className="upload-box">
      <h2>📤 Upload Resume</h2>

      <form onSubmit={uploadResume}>
        <input type="file" accept="application/pdf"
          onChange={(e) => setFile(e.target.files[0])} />

        <input type="text" placeholder="Your Name"
          value={name} onChange={(e) => setName(e.target.value)} />

        <input type="text" placeholder="Skills (comma separated)"
          value={skills} onChange={(e) => setSkills(e.target.value)} />

        <input type="text" placeholder="Experience / Role"
          value={experience} onChange={(e) => setExperience(e.target.value)} />

        <button type="submit">Mint Resume NFT</button>
      </form>

      <p>{status}</p>
    </div>
  );
};

export default UploadResume;

