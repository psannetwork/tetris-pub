'use strict';

const fs = require('fs');
const { TetrisBot } = require('./bot-ws.js');
const { BASE_AI_PARAMETERS } = require('./parameters.js');

// --- Learning Parameters ---
const POPULATION_SIZE = 50;
const GENERATIONS = 5;
const MUTATION_RATE = 0.1;
const MUTATION_AMOUNT = 0.2;
const GAMES_PER_BOT = 3;
// ---------------------------

// --- Utility Functions ---
function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function saveParameters(parameters) {
    const content = `const BASE_AI_PARAMETERS = ${JSON.stringify(parameters, null, 2)};\n\nmodule.exports = { BASE_AI_PARAMETERS };\n`;
    fs.writeFileSync('./bot/parameters.js', content);
    console.log('💾 New parameters saved to bot/parameters.js');
}
// ------------------------

class BotTrainer {
    constructor() {
        this.population = [];
    }

    initializePopulation() {
        console.log('🌱 Initializing population...');
        for (let i = 0; i < POPULATION_SIZE; i++) {
            const params = clone(BASE_AI_PARAMETERS);
            for (const key in params) {
                params[key] *= (1 + (Math.random() - 0.5) * 2);
            }
            this.population.push({ id: i, params, fitness: 0 });
        }
    }

    async evaluatePopulation() {
        console.log('🤖 Evaluating population...');
        const gamePromises = this.population.map(individual => this.runGame(individual));
        const results = await Promise.all(gamePromises);
        for (let i = 0; i < this.population.length; i++) {
            this.population[i].fitness = results[i];
            console.log(`  - Bot ${this.population[i].id} | Fitness: ${this.population[i].fitness.toFixed(2)}`);
        }
    }

    async runGame(individual) {
        return new Promise(resolve => {
            new TetrisBot(individual.id, 100, individual.params, (score) => {
                resolve(score);
            }, false, 100);
        });
    }

    selection() {
        this.population.sort((a, b) => b.fitness - a.fitness);
        return this.population.slice(0, POPULATION_SIZE / 2);
    }

    crossover(parent1, parent2) {
        const childParams = clone(parent1.params);
        for (const key in childParams) {
            if (Math.random() < 0.5) {
                childParams[key] = parent2.params[key];
            }
        }
        return childParams;
    }

    mutation(params) {
        for (const key in params) {
            if (Math.random() < MUTATION_RATE) {
                params[key] *= (1 + (Math.random() - 0.5) * MUTATION_AMOUNT);
            }
        }
        return params;
    }

    async train() {
        this.initializePopulation();

        for (let i = 0; i < GENERATIONS; i++) {
            console.log(`\n--- Generation ${i + 1}/${GENERATIONS} ---
`);
            await this.evaluatePopulation();

            const parents = this.selection();
            const newPopulation = [...parents];

            for (let j = 0; j < POPULATION_SIZE / 2; j++) {
                const parent1 = parents[Math.floor(Math.random() * parents.length)];
                const parent2 = parents[Math.floor(Math.random() * parents.length)];
                let childParams = this.crossover(parent1, parent2);
                childParams = this.mutation(childParams);
                newPopulation.push({ id: POPULATION_SIZE / 2 + j, params: childParams, fitness: 0 });
            }
            this.population = newPopulation;
        }

        console.log('\n✅ Training complete!');
        this.population.sort((a, b) => b.fitness - a.fitness);
        const bestParams = this.population[0].params;
        console.log('🏆 Best parameters:', bestParams);
        saveParameters(bestParams);
    }
}

if (require.main === module) {
    const trainer = new BotTrainer();
    trainer.train();
}
