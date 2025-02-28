const neo4j = require('neo4j-driver');
require('dotenv').config();

// 🚀 Connect to Neo4j
const driver = neo4j.driver(
    process.env.NEO4J_URI, 
    neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

/**
 * ✅ Connect Two Users Based on Vent Matching
 * - Updates similarity score (averaged)
 * - Merges common emotions into the relationship
 */
const connectUsers = async (user1, user2, similarityScore, commonEmotions) => {
    const session = driver.session();
    try {
        await session.run(
            `MERGE (u1:User {id: $user1})
             MERGE (u2:User {id: $user2})
             MERGE (u1)-[r:MATCHED]->(u2)
             ON CREATE SET r.similarity = $similarityScore, r.commonEmotions = $commonEmotions
             ON MATCH SET 
                r.similarity = (r.similarity + $similarityScore) / 2, 
                r.commonEmotions = r.commonEmotions + $commonEmotions
             RETURN u1, u2, r`,
            { user1, user2, similarityScore, commonEmotions }
        );
    } catch (error) {
        console.error("❌ Error connecting users in Neo4j:", error);
    } finally {
        await session.close();
    }
};

/**
 * ✅ Find Best Matches for a User (Direct Connections)
 * - Fetches the **strongest direct matches**
 */
const findUserMatches = async (userId) => {
    const session = driver.session();
    try {
        const result = await session.run(
            `MATCH (u:User {id: $userId})-[r:MATCHED]->(other:User)
             RETURN other.id AS matchedUser, r.similarity AS similarity, r.commonEmotions AS commonEmotions
             ORDER BY similarity DESC LIMIT 10`,
            { userId }
        );
        return result.records.map(record => ({
            userId: record.get('matchedUser'),
            similarity: record.get('similarity'),
            commonEmotions: record.get('commonEmotions')
        }));
    } catch (error) {
        console.error("❌ Error fetching user matches in Neo4j:", error);
        return [];
    } finally {
        await session.close();
    }
};

/**
 * ✅ Find Recommended Users (Second-Degree Connections)
 * - Uses **Friends-of-Friends Matching**
 */
const getUserConnections = async (userId, options = {}) => {
    const session = driver.session();
    try {
        let query;

        if (options.recommended) {
            query = `
                MATCH (u:User {id: $userId})-[r1:MATCHED]->(friend:User)-[r2:MATCHED]->(recommended:User)
                WHERE NOT (u)-[:MATCHED]-(recommended)
                AND NOT EXISTS {(u)-[:BLOCKED]-(recommended)}
                WITH recommended, avg(r2.similarity) AS avgSimilarity
                RETURN recommended.id AS userId, avgSimilarity
                ORDER BY avgSimilarity DESC LIMIT 10
            `;
        } else {
            query = `
                MATCH (u:User {id: $userId})-[r:MATCHED]->(other:User)
                RETURN other.id AS userId, r.similarity AS similarity, r.commonEmotions AS commonEmotions
                ORDER BY similarity DESC LIMIT 10
            `;
        }

        console.log(`🔍 Running Neo4j query for user ${userId}...`);

        const result = await session.run(query, { userId });

        if (result.records.length === 0) {
            console.warn(`⚠️ No matches found for user ${userId}. Returning direct matches instead.`);
            
            // If no second-degree matches exist, return direct matches instead.
            query = `
                MATCH (u:User {id: $userId})-[r:MATCHED]->(other:User)
                RETURN other.id AS userId, r.similarity AS similarity, r.commonEmotions AS commonEmotions
                ORDER BY similarity DESC LIMIT 10
            `;
            
            const directMatches = await session.run(query, { userId });

            return directMatches.records.map(record => ({
                userId: record.get('userId'),
                similarity: record.get('similarity'),
                commonEmotions: record.get('commonEmotions') || []
            }));
        }

        return result.records.map(record => ({
            userId: record.get('userId'),
            similarity: record.get('avgSimilarity') || record.get('similarity'),
            commonEmotions: record.get('commonEmotions') || []
        }));

    } catch (error) {
        console.error("❌ Error fetching user recommendations in Neo4j:", error);
        return [];
    } finally {
        await session.close();
    }
};



/**
 * ✅ Remove Connection Between Two Users
 * - Called when **users unmatch** in MongoDB
 */
const removeUserConnection = async (user1, user2) => {
    const session = driver.session();
    try {
        await session.run(
            `MATCH (u1:User {id: $user1})-[r:MATCHED]->(u2:User {id: $user2})
             DELETE r`,
            { user1, user2 }
        );
        console.log(`🗑️ Removed MATCHED relationship between ${user1} & ${user2}`);
    } catch (error) {
        console.error("❌ Error removing user connection in Neo4j:", error);
    } finally {
        await session.close();
    }
};

module.exports = { connectUsers, findUserMatches, getUserConnections, removeUserConnection };
