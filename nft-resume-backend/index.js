// server.js - FULL WORKING BACKEND
import express from "express";
import multer from "multer";
import pinataSDK from "@pinata/sdk";
import fs from "fs";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// =======================
// Middleware
// =======================
app.use(cors({
  origin: "http://localhost:3000", // Adjust for your frontend port
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve uploads folder statically (optional, for testing)
app.use("/uploads", express.static("uploads"));

// =======================
// Multer Configuration - ENHANCED
// =======================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `resume-${uniqueSuffix}.pdf`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files allowed"), false);
    }
    cb(null, true);
  }
});

// =======================
// Pinata Client
// =======================
const pinata = new pinataSDK(
  process.env.PINATA_API_KEY,
  process.env.PINATA_API_SECRET
);

// Health check for Pinata connection
const testPinataConnection = async () => {
  try {
    const result = await pinata.testAuthentication();
    console.log("✅ Pinata connected:", result);
  } catch (err) {
    console.error("❌ Pinata connection failed:", err.message);
  }
};

// =======================
// Health Check Endpoint
// =======================
app.get("/", (req, res) => {
  res.json({ 
    message: "🚀 IPFS Resume Upload Server Running!",
    timestamp: new Date().toISOString(),
    pinataConnected: true 
  });
});

// =======================
// Test Pinata Endpoint
// =======================
app.get("/test-pinata", async (req, res) => {
  try {
    await testPinataConnection();
    res.json({ success: true, message: "Pinata connection OK" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// UPLOAD RESUME + METADATA - PRODUCTION READY
// =======================
app.post("/upload-resume", upload.single("resume"), async (req, res) => {
  try {
    // Validation
    if (!req.file) {
      return res.status(400).json({ error: "Resume PDF file is required" });
    }

    const { name, description, skills, experience } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    // Parse JSON fields safely
    let parsedSkills = [];
    let parsedExperience = [];

    try {
      parsedSkills = skills ? JSON.parse(skills) : [];
      parsedExperience = experience ? JSON.parse(experience) : [];
      
      // Validate arrays
      if (!Array.isArray(parsedSkills)) parsedSkills = [];
      if (!Array.isArray(parsedExperience)) parsedExperience = [];
    } catch (parseErr) {
      console.error("JSON Parse Error:", parseErr.message);
      return res.status(400).json({
        error: "Skills and Experience must be valid JSON arrays",
        example: JSON.stringify([{ skill: "React" }])
      });
    }

    const filePath = path.join(process.cwd(), req.file.path);
    
    if (!fs.existsSync(filePath)) {
      throw new Error("Temporary file not found");
    }

    const fileStream = fs.createReadStream(filePath);

    console.log(`📤 Uploading PDF: ${req.file.originalname} for ${name}`);

    // =======================
    // 1. Upload PDF to IPFS
    // =======================
    const fileResult = await pinata.pinFileToIPFS(fileStream, {
      pinataMetadata: {
        name: `resume-${name}-${Date.now()}.pdf`,
        keyvalues: {
          type: "resume-pdf",
          owner: name
        }
      }
    });

    console.log("✅ PDF pinned:", fileResult.IpfsHash);

    // =======================
    // 2. Create & Upload Metadata JSON
    // =======================
    const metadata = {
      name: name.trim(),
      description: description?.trim() || "Professional Resume NFT",
      skills: parsedSkills,
      experience: parsedExperience,
      resumePDF: `ipfs://${fileResult.IpfsHash}`, // ✅ Correct field name for frontend
      attributes: [
        { trait_type: "Type", value: "Resume NFT" },
        { trait_type: "Pinned", value: "Pinata" },
        { trait_type: "Uploaded", value: new Date().toISOString().split('T')[0] }
      ],
      uploadedAt: new Date().toISOString()
    };

    const metadataResult = await pinata.pinJSONToIPFS(metadata, {
      pinataMetadata: {
        name: `${name.replace(/\s+/g, '-')}-resume-metadata.json`,
        keyvalues: {
          type: "resume-metadata",
          owner: name
        }
      }
    });

    console.log("✅ Metadata pinned:", metadataResult.IpfsHash);

    // =======================
    // 3. Cleanup local file
    // =======================
    try {
      fs.unlinkSync(filePath);
      console.log("🧹 Local file cleaned up");
    } catch (cleanupErr) {
      console.warn("Cleanup warning:", cleanupErr.message);
    }

    // =======================
    // 4. Success Response - FRONTEND READY
    // =======================
    res.status(200).json({
      success: true,
      metadataCID: metadataResult.IpfsHash,     // ✅ For tokenURI
      pdfCID: fileResult.IpfsHash,              // ✅ PDF hash
      metadataURL: `https://gateway.pinata.cloud/ipfs/${metadataResult.IpfsHash}`,
      pdfURL: `https://gateway.pinata.cloud/ipfs/${fileResult.IpfsHash}`,
      metadata,                                 // ✅ Full metadata backup
      size: req.file.size,
      filename: req.file.originalname
    });

  } catch (error) {
    console.error("🚨 UPLOAD ERROR:", error);
    
    // Cleanup on error
    if (req.file?.path) {
      try {
        fs.unlinkSync(path.join(process.cwd(), req.file.path));
      } catch {}
    }

    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

// =======================
// GET METADATA BY CID (Bonus endpoint)
// =======================
app.get("/metadata/:cid", async (req, res) => {
  try {
    const { cid } = req.params;
    const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return res.status(response.status).json({ error: "Metadata not found" });
    }
    
    const metadata = await response.json();
    res.json(metadata);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// Start Server
// =======================
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Test Pinata on startup
  await testPinataConnection();
  
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📱 Test endpoints:`);
    console.log(`   GET  http://localhost:${PORT}/`);
    console.log(`   GET  http://localhost:${PORT}/test-pinata`);
    console.log(`📤 Upload: POST http://localhost:${PORT}/upload-resume`);
    console.log(`🔍 Env vars loaded: PINATA_API_KEY=${!!process.env.PINATA_API_KEY ? '✅' : '❌'}`);
  });
};

startServer();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Server shutting down...');
  process.exit(0);
});
