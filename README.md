# 🚀 YieldPilot

**YieldPilot** is an automated yield optimization agent on **Solana**, powered by **x402** for paid data access.

<p align="center">
  <img src="./yieldpilot-logo.svg" alt="YieldPilot Logo" width="420" />
</p>

It continuously monitors staking yields, selects the best available protocol, and updates on-chain state accordingly.

This project demonstrates a practical integration of:
- **Solana smart contracts (Anchor)**
- **Off-chain automation**
- **x402 HTTP payment flow (402 → payment → retry)**

---

## 🧠 What Problem Does YieldPilot Solve?

Yield opportunities on Solana change frequently.  
Manually tracking APYs across protocols is inefficient and error-prone.

**YieldPilot automates this process**:
- Fetches yield data
- Decides when a better opportunity exists
- Updates a shared on-chain state that other apps can trust

---



