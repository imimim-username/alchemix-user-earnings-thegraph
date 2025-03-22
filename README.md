# Alchemix User Earnings Subgraph (TheGraph Deployment)

## Description

This subgraph is an indexing tool for tracking user earnings across Alchemix protocol deployments. To be deployed on TheGraph, it provides comprehensive indexing of user interactions with AlchemistV2 contracts across multiple networks.

## Key Features

- 🌐 Multi-chain Support: Indexes AlchemistV2 deployments on Mainnet, Arbitrum, and Optimism
- 📊 Comprehensive Tracking:
  - User deposits
  - Harvest events
  - Yield token additions
- 🔍 Detailed Earnings Analysis

## Prerequisites

- [Graph CLI](https://thegraph.com/docs/en/subgraphs/developing/creating/install-the-cli/)
- npm
- TheGraph account and Studio setup [see](https://thegraph.com/docs/en/subgraphs/quick-start/)

## Installation

1. Clone the repository:

```bash
git clone https://github.com/pastelfork/alchemix-user-earnings-thegraph.git
cd alchemix-user-earnings-thegraph
```

1.1 Authenticate in graph studio
```bash
git auth --studio [deploy key]
```

2. Build and deploy:

```bash
graph build --network [NETWORK]
graph deploy --network [NETWORK]
```

Preconfigured networks:

- `mainnet`
- `arbitrum-one`
- `optimism`

Follow the CLI prompts to complete deployment.
