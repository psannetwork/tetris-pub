'use strict';

const fs = require('fs');
const { TetrisBot } = require('./bot-ws.js');
const { BASE_AI_PARAMETERS } = require('./parameters.js');

// --- Learning Parameters ---
const POPULATION_SIZE = 10; // Increased for better diversity
const GENERATIONS = 20;      // Increased for better optimization
const MUTATION_RATE = 0.2;   // Increased to promote diversity
const MUTATION_AMOUNT = 0.3; // Increased for better exploration
const GAMES_PER_BOT = 3;
const MAX_CONCURRENT_GAMES = 10; // Increased to allow more parallel games
// ---------------------------

// --- Utility Functions ---
function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function saveParameters(parameters) {
    try {
        const content = `const BASE_AI_PARAMETERS = ${JSON.stringify(parameters, null, 2)};\n\nmodule.exports = { BASE_AI_PARAMETERS };\n`;
        fs.writeFileSync('./bot/parameters.js', content);
        console.log('💾 New parameters saved to bot/parameters.js');
    } catch (error) {
        console.error('❌ Error saving parameters:', error.message);
    }
}

function sanitizeParameters(params) {
    const sanitized = clone(params);
    for (const key in sanitized) {
        if (typeof sanitized[key] === 'number') {
            // Ensure parameters are within reasonable bounds
            if (Math.abs(sanitized[key]) > 1000) {
                sanitized[key] = Math.sign(sanitized[key]) * 1000;
            }
            // Ensure no NaN or Infinity values
            if (!isFinite(sanitized[key])) {
                sanitized[key] = 0;
            }
        }
    }
    return sanitized;
}

// Semaphore to limit concurrent games
class Semaphore {
    constructor(max) {
        this.max = max;
        this.current = 0;
        this.queue = [];
    }

    async acquire() {
        return new Promise((resolve) => {
            if (this.current < this.max) {
                this.current++;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }

    release() {
        this.current--;
        if (this.queue.length > 0) {
            this.current++;
            const next = this.queue.shift();
            next();
        }
    }
}

// Limit concurrent games to prevent server overload
const gameSemaphore = new Semaphore(MAX_CONCURRENT_GAMES);
// ------------------------

class BotTrainer {
    constructor() {
        this.population = [];
        this.generation = 0;
    }

    initializePopulation() {
        console.log(`🌱 Initializing population of size ${POPULATION_SIZE}...`);
        for (let i = 0; i < POPULATION_SIZE; i++) {
            let params = clone(BASE_AI_PARAMETERS);
            // Add random variation to base parameters
            for (const key in params) {
                if (typeof params[key] === 'number') {
                    params[key] *= (1 + (Math.random() - 0.5) * 0.5); // ±25% variation
                }
            }
            params = sanitizeParameters(params); // Ensure valid parameters
            this.population.push({ id: i, params, fitness: 0 });
        }
    }

    async evaluatePopulation() {
        console.log(`🤖 Evaluating population... (Playing ${GAMES_PER_BOT} games per bot)`);

        // Create all game promises at once to allow maximum parallelization
        const gamePromises = [];
        const botScores = this.population.map(() => []);

        // Schedule all games
        for (let i = 0; i < this.population.length; i++) {
            const individual = this.population[i];
            for (let j = 0; j < GAMES_PER_BOT; j++) {
                const gamePromise = (async () => {
                    try {
                        await gameSemaphore.acquire();
                        const score = await Promise.race([
                            this.runGame(individual),
                            new Promise(resolve => setTimeout(() => resolve(0), 35000)) // 35 second timeout for safety
                        ]);
                        return { botIndex: i, score };
                    } catch (error) {
                        console.error(`❌ Error in game ${j+1} for bot ${individual.id}:`, error.message);
                        return { botIndex: i, score: 0 }; // Add 0 if game fails
                    } finally {
                        gameSemaphore.release();
                    }
                })();
                gamePromises.push(gamePromise);
            }
        }

        // Execute all games in parallel
        const results = await Promise.all(gamePromises);

        // Group results by bot
        for (const result of results) {
            botScores[result.botIndex].push(result.score);
        }

        // Calculate fitness for each bot
        for (let i = 0; i < this.population.length; i++) {
            const scores = botScores[i];
            const totalScore = scores.reduce((sum, score) => sum + score, 0);
            this.population[i].fitness = totalScore / GAMES_PER_BOT;
            console.log(`  - Bot ${i} | Average Fitness: ${this.population[i].fitness.toFixed(2)} | Scores: [${scores.join(', ')}]`);
        }
    }

    runGame(individual) {
        return new Promise((resolve, reject) => {
            try {
                // Create bot with proper callback interface
                const bot = new TetrisBot(
                    individual.id + '-' + Date.now(), // Unique ID to prevent conflicts
                    100,
                    individual.params,
                    (score) => {
                        if (score !== undefined && score !== null) {
                            resolve(score);
                        } else {
                            resolve(0);
                        }
                    },
                    true, // enableAnimation - can be disabled for faster training
                    1 // Fast move delay to speed up training
                );

                // Add timeout to prevent hanging bots
                setTimeout(() => {
                    resolve(0); // Default score if game hangs
                }, 25000); // 25 seconds timeout

            } catch (error) {
                console.error(`❌ Error creating bot for individual ${individual.id}:`, error);
                resolve(0);
            }
        });
    }

    selection() {
        // Sort by fitness descending
        this.population.sort((a, b) => b.fitness - a.fitness);
        // Select top performers
        const survivors = this.population.slice(0, Math.floor(POPULATION_SIZE / 2));
        console.log(`  🏆 Best fitness: ${this.population[0].fitness.toFixed(2)}, Worst: ${this.population[this.population.length - 1].fitness.toFixed(2)}`);
        return survivors;
    }

    crossover(parent1, parent2) {
        const childParams = clone(parent1.params);
        // Blend parameters from both parents with some randomness
        for (const key in childParams) {
            if (typeof childParams[key] === 'number' &&
                typeof parent2.params[key] === 'number') {
                // Blend the parameters (not just random selection)
                const blendFactor = Math.random();
                childParams[key] = blendFactor * parent1.params[key] + (1 - blendFactor) * parent2.params[key];
            }
        }
        return childParams;
    }

    mutation(params) {
        const mutatedParams = clone(params);
        for (const key in mutatedParams) {
            if (typeof mutatedParams[key] === 'number') {
                if (Math.random() < MUTATION_RATE) {
                    // Apply Gaussian-like mutation for better exploration
                    const mutationAmount = (Math.random() * 2 - 1) * MUTATION_AMOUNT;
                    mutatedParams[key] = mutatedParams[key] * (1 + mutationAmount);

                    // Limit extreme values
                    if (Math.abs(mutatedParams[key]) > 100) {
                        mutatedParams[key] = Math.sign(mutatedParams[key]) * Math.min(Math.abs(mutatedParams[key]), 100);
                    }
                }
            }
        }
        return sanitizeParameters(mutatedParams);
    }

    async train() {
        console.log(`🚀 Starting training with ${GENERATIONS} generations...`);
        this.initializePopulation();

        for (let gen = 0; gen < GENERATIONS; gen++) {
            this.generation = gen + 1;
            console.log(`\n--- Generation ${gen + 1}/${GENERATIONS} ---`);

            await this.evaluatePopulation();

            const parents = this.selection();
            const bestOfGeneration = this.population[0].params;
            const bestScore = this.population[0].fitness;
            console.log(`🏆 Best of Generation ${gen + 1}: Score = ${bestScore.toFixed(2)}`);
            console.log(`📊 Best parameters: ${JSON.stringify(bestOfGeneration, null, 2).substring(0, 200)}...`);

            // Save best of generation
            saveParameters(bestOfGeneration);

            // Create new generation with elitism
            const newPopulation = [...parents]; // Keep best performers

            // Generate offspring to fill population
            while (newPopulation.length < POPULATION_SIZE) {
                const parent1 = parents[Math.floor(Math.random() * parents.length)];
                const parent2 = parents[Math.floor(Math.random() * parents.length)];
                let childParams = this.crossover(parent1, parent2);
                childParams = this.mutation(childParams);

                newPopulation.push({
                    id: newPopulation.length,
                    params: childParams,
                    fitness: 0
                });
            }

            this.population = newPopulation;

            // Add a small delay to prevent overwhelming the system
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('\n✅ Training complete!');
        this.population.sort((a, b) => b.fitness - a.fitness);
        const bestParams = this.population[0].params;
        const bestFitness = this.population[0].fitness;
        console.log('🏆 Final best parameters:', bestParams);
        console.log(`🏆 Final best fitness: ${bestFitness.toFixed(2)}`);

        saveParameters(bestParams);
        console.log('🎉 Training completed successfully!');
        process.exit(0);
    }
}

if (require.main === module) {
    console.log('🤖 Bot Learning System Starting...');

    // Add graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Training interrupted by user');
        process.exit(0);
    });

    process.on('uncaughtException', (error) => {
        console.error('❌ Uncaught Exception:', error);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    });

    const trainer = new BotTrainer();
    trainer.train().catch(error => {
        console.error('❌ Training error:', error);
        process.exit(1);
    });
}
