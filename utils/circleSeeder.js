const mongoose = require('mongoose');
const SupportCircle = require('../models/SupportCircles');
const User = require('../models/User');
const connectDB = require('../config/db');
const dotenv = require('dotenv');

dotenv.config();

// Initial set of support circles organized by category
const supportCircles = [
  // Anxiety & Stress Management
  {
    name: "Anxiety Support Circle",
    description: "A safe space to share experiences with anxiety and learn coping strategies together.",
    category: "Anxiety & Stress",
    tags: ["anxiety", "panic attacks", "stress management", "coping strategies"],
    rules: [
      {
        title: "Focus on Support",
        description: "While sharing challenges is important, try to include what helps you cope."
      },
      {
        title: "Respect Different Experiences",
        description: "Everyone's anxiety manifests differently. Acknowledge all experiences as valid."
      }
    ],
    isPrivate: false,
    memberLimit: 20,
    weeklyTopics: [
      {
        title: "Recognizing Anxiety Triggers",
        description: "Let's discuss what triggers our anxiety and how we identify the early warning signs.",
        resources: [
          {
            title: "Anxiety Trigger Worksheet",
            description: "A helpful tool for identifying your personal anxiety triggers",
            type: "exercise"
          },
          {
            title: "Understanding the Stress Response",
            description: "How your body responds to stress and anxiety",
            type: "article"
          }
        ],
        guideQuestions: [
          "What situations typically trigger your anxiety?",
          "What physical sensations do you notice first?",
          "What strategies help you when you notice these triggers?"
        ],
        activeFrom: new Date(Date.now()),
        activeTo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // One week from now
      }
    ]
  },
  
  // Work Stress & Burnout
  {
    name: "Burnout Recovery & Prevention",
    description: "For professionals dealing with work-related stress, burnout, or wanting to establish healthier work boundaries.",
    category: "Work Stress & Burnout",
    tags: ["burnout", "work-life balance", "boundaries", "career stress"],
    rules: [
      {
        title: "Share Practical Solutions",
        description: "When possible, share what's worked for you in managing work stress."
      },
      {
        title: "No Company-Specific Details",
        description: "For privacy and professional reasons, avoid sharing specific company names or identifying details."
      }
    ],
    isPrivate: false,
    memberLimit: 30,
    weeklyTopics: [
      {
        title: "Setting Effective Work Boundaries",
        description: "Discussing strategies for creating healthy boundaries between work and personal life.",
        resources: [
          {
            title: "Digital Boundaries Checklist",
            description: "Practical steps to separate work and personal time in a digital world",
            type: "exercise"
          },
          {
            title: "Saying No Without Guilt",
            description: "How to decline additional work respectfully",
            type: "article"
          }
        ],
        guideQuestions: [
          "What boundaries have you struggled to maintain at work?",
          "What's one boundary you've successfully implemented?",
          "How do you handle boundary violations when they occur?"
        ],
        activeFrom: new Date(Date.now()),
        activeTo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // One week from now
      }
    ]
  },
  
  // Grief & Loss
  {
    name: "Grief Journey Circle",
    description: "A compassionate community for those experiencing grief in any form - whether from death, relationship loss, or major life changes.",
    category: "Grief & Loss",
    tags: ["grief", "bereavement", "coping with loss", "healing"],
    rules: [
      {
        title: "All Types of Grief Welcome",
        description: "We recognize that grief comes in many forms - loss of loved ones, relationships, jobs, health, or dreams."
      },
      {
        title: "No Timeline on Grief",
        description: "There's no 'getting over it' timeline. Your process is yours alone and is respected here."
      }
    ],
    isPrivate: true,
    memberLimit: 15,
    weeklyTopics: [
      {
        title: "Living With Grief",
        description: "How do we continue living while carrying our grief? Share your experiences and strategies.",
        resources: [
          {
            title: "Continuing Bonds: A New Understanding of Grief",
            description: "Article about maintaining healthy connections with what we've lost",
            type: "article"
          },
          {
            title: "Grief Journaling Prompts",
            description: "Prompts to explore your grief journey through writing",
            type: "exercise"
          }
        ],
        guideQuestions: [
          "How has your relationship with grief changed over time?",
          "What helps you on particularly difficult days?",
          "How do you honor what you've lost while still moving forward?"
        ],
        activeFrom: new Date(Date.now()),
        activeTo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // One week from now
      }
    ]
  },
  
  // Life Transitions
  {
    name: "Major Life Transitions",
    description: "Support for navigating big life changes: moving, career shifts, relationship changes, becoming a parent, retirement, and more.",
    category: "Life Transitions",
    tags: ["change", "transitions", "adaptation", "personal growth"],
    rules: [
      {
        title: "Acknowledge Ambivalence",
        description: "It's normal to have mixed feelings about changes, even positive ones."
      },
      {
        title: "Focus on Process, Not Just Outcomes",
        description: "Share the journey of your transition, not just where you ended up."
      }
    ],
    isPrivate: false,
    memberLimit: 25,
    weeklyTopics: [
      {
        title: "The Identity Shift in Major Changes",
        description: "Discussing how major life transitions can change how we see ourselves.",
        resources: [
          {
            title: "Bridges' Transition Model",
            description: "Understanding the psychological process of transition",
            type: "article"
          },
          {
            title: "Values Reassessment Exercise",
            description: "Reconnect with your core values during times of change",
            type: "exercise"
          }
        ],
        guideQuestions: [
          "How has a recent transition affected your sense of self?",
          "What parts of your identity have remained stable through changes?",
          "What new aspects of yourself have you discovered through transition?"
        ],
        activeFrom: new Date(Date.now()),
        activeTo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // One week from now
      }
    ]
  },
  
  // Relationship Challenges
  {
    name: "Healthy Relationships Circle",
    description: "For discussing relationship patterns, communication challenges, and building healthier connections with partners, family, and friends.",
    category: "Relationship Challenges",
    tags: ["relationships", "communication", "boundaries", "conflict resolution"],
    rules: [
      {
        title: "Focus on Your Side",
        description: "Share your experiences and feelings rather than venting about others."
      },
      {
        title: "No Specific Advice",
        description: "Share perspectives and experiences rather than telling others what they 'should' do."
      }
    ],
    isPrivate: false,
    memberLimit: 20,
    weeklyTopics: [
      {
        title: "Communication Patterns",
        description: "Exploring our habitual ways of communicating in close relationships.",
        resources: [
          {
            title: "The Four Communication Styles",
            description: "Understanding passive, aggressive, passive-aggressive and assertive communication",
            type: "article"
          },
          {
            title: "Active Listening Exercise",
            description: "Practice truly hearing others without planning your response",
            type: "exercise"
          }
        ],
        guideQuestions: [
          "What communication patterns did you learn growing up?",
          "What's your default communication style when stressed?",
          "What's one communication habit you'd like to change?"
        ],
        activeFrom: new Date(Date.now()),
        activeTo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // One week from now
      }
    ]
  }
];

// Connect to database and seed circles
const seedSupportCircles = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    console.log('🌐 Connected to MongoDB');
    
    // Get the first user as admin (for testing purposes)
    const adminUser = await User.findOne().sort('createdAt');
    
    if (!adminUser) {
      console.error('❌ No users found. Please create at least one user first.');
      process.exit(1);
    }
    
    // Clear existing circles
    await SupportCircle.deleteMany({});
    console.log('🧹 Cleared existing support circles');
    
    // Add admin user to all circles as creator and admin
    const circlesWithAdmin = supportCircles.map(circle => ({
      ...circle,
      createdBy: adminUser._id,
      members: [{
        userId: adminUser._id,
        role: 'admin',
        status: 'active',
        joinedAt: new Date()
      }],
      moderators: [adminUser._id]
    }));
    
    // Insert new circles
    await SupportCircle.insertMany(circlesWithAdmin);
    console.log(`✅ Successfully seeded ${circlesWithAdmin.length} support circles`);
    
    // Disconnect and exit
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding support circles:', error);
    process.exit(1);
  }
};

// Run the seeding function
seedSupportCircles();