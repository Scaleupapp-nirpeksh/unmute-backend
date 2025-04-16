const OpenAI = require('openai');
const { JournalEntry } = require('../models/Journal');
const dotenv = require('dotenv');
const { updateMatchesForUser } = require('./matchScoringService');

dotenv.config();

// Initialize OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * ✅ Analyze a journal entry using AI
 * - Detects emotions, topics, and provides insights
 * - Updates the journal entry with analysis results
 */
const analyzeJournalEntry = async (journalId) => {
  try {
    const entry = await JournalEntry.findById(journalId);
    if (!entry) {
      throw new Error(`Journal entry with ID ${journalId} not found`);
    }

    // Construct the prompt for the OpenAI API
    const prompt = `
      Analyze the following journal entry for emotional content, topics, and potential insights. 
      Consider the tone, word choice, and themes.
      
      Journal Title: ${entry.title}
      
      Journal Content:
      ${entry.content}
      
      Provide a structured analysis in JSON format with the following fields:
      - dominantEmotion: The primary emotion expressed (choose one: Happy, Sad, Angry, Anxious, Neutral, Burnout, Peaceful, Excited, Grateful, Overwhelmed, Hopeful, Disappointed)
      - emotionalIntensity: A number from 1-10 indicating the strength of emotions
      - topics: An array of up to 5 main topics or themes discussed
      - insightSummary: A brief, compassionate summary of the key insight from this entry
      - suggestedResources: Array of up to 3 potential resources that might help, each with title and type (e.g., "article", "exercise", "community")
    `;

    // Call OpenAI API with error handling and rate limiting
    const response = await callOpenAIWithRetry(prompt);
    
    if (!response) {
      console.error(`❌ Failed to analyze journal entry ${journalId} after multiple attempts`);
      return null;
    }

    // Parse the response
    let analysis;
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No valid JSON found in response');
      }
    } catch (parseError) {
      console.error('❌ Error parsing OpenAI response:', parseError);
      console.log('Raw response:', response);
      
      // Fallback to a simplified analysis
      analysis = {
        dominantEmotion: entry.emotions.length > 0 ? entry.emotions[0] : 'Neutral',
        emotionalIntensity: 5,
        topics: entry.tags || [],
        insightSummary: 'Analysis could not be completed.',
        suggestedResources: []
      };
    }

    // Make sure suggestedResources is an array of objects with the correct structure
    const formattedResources = Array.isArray(analysis.suggestedResources) 
      ? analysis.suggestedResources.map(resource => {
          // If it's already an object with the right properties, just add an ID
          if (typeof resource === 'object' && resource.title && resource.type) {
            return {
              title: resource.title,
              type: resource.type,
              id: generateResourceId(resource)
            };
          }
          // If it's a string or malformed object, create a basic resource
          return {
            title: typeof resource === 'string' ? resource : 'Resource',
            type: 'article',
            id: generateResourceId({ 
              title: typeof resource === 'string' ? resource : 'Resource',
              type: 'article'
            })
          };
        })
      : []; // Default to empty array if not an array

    // Update the journal entry with the analysis
    entry.aiAnalysis = {
      dominantEmotion: analysis.dominantEmotion || 'Neutral',
      emotionalIntensity: analysis.emotionalIntensity || 5,
      topics: Array.isArray(analysis.topics) ? analysis.topics : [],
      suggestedResources: formattedResources,
      insightSummary: analysis.insightSummary || 'No insights available.'
    };

    // Update emotions if the user hasn't specified any
    if (!entry.emotions || entry.emotions.length === 0) {
      entry.emotions = [analysis.dominantEmotion || 'Neutral'];
    }

    // Update tags if the user hasn't specified any
    if (!entry.tags || entry.tags.length === 0) {
      entry.tags = Array.isArray(analysis.topics) ? analysis.topics : [];
    }

    await entry.save();
    
    // If entry is used for matching, update matches
    if (entry.useForMatching) {
      updateMatchesForUser(entry.userId).catch(err => 
        console.error(`❌ Error updating matches for user ${entry.userId}:`, err)
      );
    }

    return entry.aiAnalysis;
  } catch (error) {
    console.error('❌ Error analyzing journal entry:', error);
    return null;
  }
};

/**
 * ✅ Call OpenAI with retry logic for rate limits
 */
const callOpenAIWithRetry = async (prompt, maxRetries = 3, delay = 1000) => {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4", // Can be configured to a less expensive model
        messages: [
          {
            role: "system",
            content: "You are an emotional intelligence assistant specialized in analyzing journal entries. Provide thoughtful analysis in valid JSON format. Be compassionate and insightful."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.5,
        max_tokens: 1000
      });
      
      return response.choices[0].message.content;
    } catch (error) {
      retries++;
      console.warn(`⚠️ OpenAI API error (attempt ${retries}/${maxRetries}):`, error.message);
      
      // Check if it's a rate limit error
      if (error.statusCode === 429 || (error.response && error.response.status === 429)) {
        // Wait with exponential backoff
        const waitTime = delay * Math.pow(2, retries);
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else if (retries >= maxRetries) {
        throw error; // Re-throw if it's not a rate limit or we've exhausted retries
      }
    }
  }
  
  return null; // Return null if all retries failed
};

/**
 * ✅ Generate a unique ID for a resource
 */
const generateResourceId = (resource) => {
  if (!resource || !resource.title || !resource.type) {
    return `resource-${Date.now().toString(36)}`;
  }
  
  const titleHash = resource.title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 10);
  
  return `${resource.type}-${titleHash}-${Date.now().toString(36)}`;
};

/**
 * ✅ Batch analyze multiple journal entries
 * - For use in background jobs
 */
const batchAnalyzeJournalEntries = async (limit = 10) => {
  try {
    // Find entries without analysis
    const entries = await JournalEntry.find({ 
      'aiAnalysis.dominantEmotion': { $exists: false } 
    }).limit(limit);
    
    console.log(`🔍 Batch analyzing ${entries.length} journal entries`);
    
    const results = await Promise.allSettled(
      entries.map(entry => analyzeJournalEntry(entry._id))
    );
    
    // Log results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`✅ Batch analysis complete: ${successful} successful, ${failed} failed`);
    
    return { successful, failed };
  } catch (error) {
    console.error('❌ Error in batch journal analysis:', error);
    throw error;
  }
};

module.exports = { 
  analyzeJournalEntry,
  batchAnalyzeJournalEntries
};