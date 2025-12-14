import express from "express";
import multer from "multer";
import PinataSDK from "@pinata/sdk";
import fs from "fs";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Multer setup for file uploads
const upload = multer({ dest: "uploads/" });

// Pinata client
const pinata = new PinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_API_SECRET);

// ====================
// Upload Resume + Metadata
// ====================
app.post("/upload-resume", upload.single("resume"), async (req, res) => {
  try {
    const { name, description, skills, experience } = req.body;

    // Read uploaded file
    const filePath = path.join(process.cwd(), req.file.path);
    const readableStream = fs.createReadStream(filePath);

    // Pin the PDF file to IPFS
    const fileResult = await pinata.pinFileToIPFS(readableStream, {
      pinataMetadata: { name: req.file.originalname }
    });

    // Construct JSON metadata
    const metadataJSON = {
      name,
      description,
      skills: skills ? JSON.parse(skills) : [],
      experience: experience ? JSON.parse(experience) : [],
      resumePDF: `ipfs://${fileResult.IpfsHash}`
    };

    // Pin JSON metadata
    const metadataResult = await pinata.pinJSONToIPFS(metadataJSON, {
      pinataMetadata: { name: `${name}-resume-metadata` }
    });

    // Delete local uploaded file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      cid: `ipfs://${metadataResult.IpfsHash}`
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================
// Start server
// ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
