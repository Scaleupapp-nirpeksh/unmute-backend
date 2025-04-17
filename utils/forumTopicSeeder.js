const mongoose = require('mongoose');
const ForumTopic = require('../models/ForumTopic');
const connectDB = require('../config/db');
const dotenv = require('dotenv');

dotenv.config();

// Initial set of forum topics
const forumTopics = [
  // Mental Health Topics
  {
    name: "Anxiety & Stress",
    slug: "anxiety-stress",
    description: "Discuss coping strategies, experiences, and questions related to anxiety and stress management.",
    color: "#3498db",
    iconUrl: "/icons/anxiety.svg",
    sortOrder: 1,
    isSubTopic: false
  },
  {
    name: "Depression",
    slug: "depression",
    description: "A supportive space to ask questions about depression, from managing symptoms to supporting loved ones.",
    color: "#9b59b6",
    iconUrl: "/icons/depression.svg",
    sortOrder: 2,
    isSubTopic: false
  },
  {
    name: "Self-Care & Wellness",
    slug: "self-care-wellness",
    description: "Questions about maintaining overall mental and emotional wellbeing through healthy practices.",
    color: "#2ecc71",
    iconUrl: "/icons/wellness.svg",
    sortOrder: 3,
    isSubTopic: false
  },
  
  // Relationship Topics
  {
    name: "Relationships",
    slug: "relationships",
    description: "Questions about romantic relationships, including communication, conflict, and connection.",
    color: "#e74c3c",
    iconUrl: "/icons/relationships.svg",
    sortOrder: 4,
    isSubTopic: false
  },
  {
    name: "Family Dynamics",
    slug: "family-dynamics",
    description: "Explore questions about family relationships, boundaries, and conflicts.",
    color: "#f39c12",
    iconUrl: "/icons/family.svg",
    sortOrder: 5,
    isSubTopic: false
  },
  {
    name: "Friendships",
    slug: "friendships",
    description: "Questions about making, maintaining, and navigating challenges in friendships.",
    color: "#1abc9c",
    iconUrl: "/icons/friendship.svg",
    sortOrder: 6,
    isSubTopic: false
  },
  
  // Work & Career Topics
  {
    name: "Work Stress & Burnout",
    slug: "work-stress-burnout",
    description: "Questions about managing workplace pressures, preventing burnout, and finding balance.",
    color: "#34495e",
    iconUrl: "/icons/work-stress.svg",
    sortOrder: 7,
    isSubTopic: false
  },
  {
    name: "Career Development",
    slug: "career-development",
    description: "Questions about career choices, growth, transitions, and finding meaningful work.",
    color: "#16a085",
    iconUrl: "/icons/career.svg",
    sortOrder: 8,
    isSubTopic: false
  },
  
  // Life Challenges
  {
    name: "Life Transitions",
    slug: "life-transitions",
    description: "Questions about navigating major life changes like moving, changing careers, or relationship shifts.",
    color: "#8e44ad",
    iconUrl: "/icons/transitions.svg",
    sortOrder: 9,
    isSubTopic: false
  },
  {
    name: "Grief & Loss",
    slug: "grief-loss",
    description: "A supportive space for questions about coping with grief and processing different types of loss.",
    color: "#7f8c8d",
    iconUrl: "/icons/grief.svg",
    sortOrder: 10,
    isSubTopic: false
  },
  {
    name: "Trauma & Recovery",
    slug: "trauma-recovery",
    description: "Questions about healing from trauma, understanding its effects, and supporting recovery.",
    color: "#d35400",
    iconUrl: "/icons/trauma.svg",
    sortOrder: 11,
    isSubTopic: false
  },
  
  // Personal Growth
  {
    name: "Mindfulness & Meditation",
    slug: "mindfulness-meditation",
    description: "Questions about practices for present-moment awareness and meditation techniques.",
    color: "#27ae60",
    iconUrl: "/icons/mindfulness.svg",
    sortOrder: 12,
    isSubTopic: false
  },
  {
    name: "Personal Development",
    slug: "personal-development",
    description: "Questions about self-improvement, habits, and creating positive change in your life.",
    color: "#2980b9",
    iconUrl: "/icons/development.svg",
    sortOrder: 13,
    isSubTopic: false
  },
  {
    name: "Emotional Intelligence",
    slug: "emotional-intelligence",
    description: "Questions about understanding, managing, and expressing emotions effectively.",
    color: "#c0392b",
    iconUrl: "/icons/emotions.svg",
    sortOrder: 14,
    isSubTopic: false
  },
  
  // Subcategories for Anxiety & Stress
  {
    name: "Social Anxiety",
    slug: "social-anxiety",
    description: "Questions specific to anxiety in social situations and interactions.",
    color: "#3498db",
    iconUrl: "/icons/social-anxiety.svg",
    sortOrder: 1,
    isSubTopic: true,
    parentTopic: "Anxiety & Stress"
  },
  {
    name: "Panic Attacks",
    slug: "panic-attacks",
    description: "Questions about managing and understanding panic attacks and panic disorder.",
    color: "#3498db",
    iconUrl: "/icons/panic.svg",
    sortOrder: 2,
    isSubTopic: true,
    parentTopic: "Anxiety & Stress"
  },
  {
    name: "Work-Related Stress",
    slug: "work-related-stress",
    description: "Questions about managing stress specifically in workplace contexts.",
    color: "#3498db",
    iconUrl: "/icons/work-stress.svg",
    sortOrder: 3,
    isSubTopic: true,
    parentTopic: "Anxiety & Stress"
  },
  
  // Subcategories for Depression
  {
    name: "Treatment Options",
    slug: "depression-treatment",
    description: "Questions about different approaches to treating depression.",
    color: "#9b59b6",
    iconUrl: "/icons/treatment.svg",
    sortOrder: 1,
    isSubTopic: true,
    parentTopic: "Depression"
  },
  {
    name: "Supporting Someone with Depression",
    slug: "supporting-depression",
    description: "Questions about how to best support a loved one experiencing depression.",
    color: "#9b59b6",
    iconUrl: "/icons/support.svg",
    sortOrder: 2,
    isSubTopic: true,
    parentTopic: "Depression"
  },
  
  // Subcategories for Work Stress & Burnout
  {
    name: "Setting Boundaries",
    slug: "work-boundaries",
    description: "Questions about establishing healthy boundaries in professional settings.",
    color: "#34495e",
    iconUrl: "/icons/boundaries.svg",
    sortOrder: 1,
    isSubTopic: true,
    parentTopic: "Work Stress & Burnout"
  },
  {
    name: "Recovery from Burnout",
    slug: "burnout-recovery",
    description: "Questions about healing and recovering after experiencing work burnout.",
    color: "#34495e",
    iconUrl: "/icons/recovery.svg",
    sortOrder: 2,
    isSubTopic: true,
    parentTopic: "Work Stress & Burnout"
  }
];

// Connect to database and seed topics
const seedForumTopics = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    console.log('🌐 Connected to MongoDB');
    
    // Clear existing topics
    await ForumTopic.deleteMany({});
    console.log('🧹 Cleared existing forum topics');
    
    // Process topics to handle parent topics
    const topicMap = {};
    const topicsToInsert = [];
    
    // First pass: create all parent topics
    forumTopics.filter(topic => !topic.isSubTopic).forEach(topic => {
      const newTopic = {
        ...topic,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      topicMap[topic.name] = newTopic;
      topicsToInsert.push(newTopic);
    });
    
    // Second pass: create subtopics with parent references
    forumTopics.filter(topic => topic.isSubTopic).forEach(topic => {
      if (topic.parentTopic && topicMap[topic.parentTopic]) {
        const parentId = topicMap[topic.parentTopic]._id || 
                         new mongoose.Types.ObjectId();
        
        if (!topicMap[topic.parentTopic]._id) {
          topicMap[topic.parentTopic]._id = parentId;
        }
        
        const newTopic = {
          ...topic,
          parentTopic: parentId,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        topicsToInsert.push(newTopic);
      } else {
        console.warn(`⚠️ Parent topic "${topic.parentTopic}" not found for "${topic.name}"`);
      }
    });
    
    // Insert all topics
    await ForumTopic.insertMany(topicsToInsert);
    console.log(`✅ Successfully seeded ${topicsToInsert.length} forum topics`);
    
    // Update related topics
    // (This would require additional logic to establish relationships)
    
    // Disconnect and exit
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding forum topics:', error);
    process.exit(1);
  }
};

// Run the seeding function
seedForumTopics();