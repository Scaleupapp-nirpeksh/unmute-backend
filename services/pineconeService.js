const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');
require('dotenv').config();
const fetch = require('cross-fetch');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Initialize Pinecone with only apiKey
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
    //fetchApi: globalThis.fetch 
    fetchApi: fetch
});

console.log("✅ Pinecone Initialized Successfully!");

// Get Pinecone Index
const getPineconeIndex = () => {
    return pinecone.Index("unmute-vents"); // Ensure this index exists in your Pinecone project
};

// Function to Generate Text Embeddings
const generateEmbedding = async (text) => {
    const response = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text
    });
    return response.data[0].embedding;
};

// Function to Store Vent in Pinecone
const storeVentEmbedding = async (ventId, text, metadata) => {
    try {
        const embedding = await generateEmbedding(text);
        const pineconeIndex = getPineconeIndex();
        await pineconeIndex.upsert([{ id: ventId.toString(), values: embedding, metadata }]);
    } catch (error) {
        console.error("❌ Error storing vent embedding:", error);
    }
};

// Function to Query Similar Vents
const findSimilarVents = async (text) => {
    try {
        const queryEmbedding = await generateEmbedding(text);
        const pineconeIndex = getPineconeIndex();
        const results = await pineconeIndex.query({
            vector: queryEmbedding,
            topK: 10,
            includeMetadata: true
        });
        return results.matches;
    } catch (error) {
        console.error("❌ Error querying similar vents:", error);
        return [];
    }
};

module.exports = { storeVentEmbedding, findSimilarVents };