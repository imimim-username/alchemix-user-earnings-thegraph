/**
 * @file alchemist-v2.ts
 * @description Event handlers for AlchemistV2 contract events in the Alchemix protocol.
 * This file contains mappings for tracking yield token additions, deposits, harvests,
 * and donations in the Alchemix V2 system. It maintains user positions, earnings,
 * and donation distributions across yield token holders.
 */

import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import {
  AddYieldToken as AddYieldTokenEvent,
  Deposit as DepositEvent,
  Harvest as HarvestEvent,
  Donate as DonateEvent,
  AlchemistV2Impl as AlchemistV2,
} from "../../generated/AlchemistV2-AlETH/AlchemistV2Impl";
import {
  YieldToken as YieldTokenEntity,
  Depositor as DepositorEntity,
  HarvestEvent as HarvestEventEntity,
  UserHarvestShare as UserHarvestShareEntity,
  DonateEvent as DonateEventEntity,
  UserDonateShare as UserDonateShareEntity,
} from "../../generated/schema";

/**
 * Handles the AddYieldToken event from the AlchemistV2 contract
 * Creates a new YieldToken entity and initializes it with contract parameters
 * @param event The AddYieldToken event containing yield token information
 */
export function handleAddYieldToken(event: AddYieldTokenEvent): void {
  let yieldToken = new YieldTokenEntity(event.params.yieldToken.toHexString());
  yieldToken.yieldToken = event.params.yieldToken;
  yieldToken.totalShares = BigInt.fromI32(0);

  // Fetch and store token parameters from the contract
  let contract = AlchemistV2.bind(event.address);
  let params = contract.getYieldTokenParameters(event.params.yieldToken);
  yieldToken.decimals = params.decimals;

  yieldToken.save();
}

/**
 * Handles the Deposit event from the AlchemistV2 contract
 * Creates or updates a Depositor entity to track user deposits for specific yield tokens
 * @param event The Deposit event containing sender and yield token information
 */
export function handleDeposit(event: DepositEvent): void {
  let depositorId =
    event.params.recipient.toHexString() +
    "-" +
    event.params.yieldToken.toHexString();
  let depositor = DepositorEntity.load(depositorId);

  // Initialize new depositor if they don't exist
  if (depositor == null) {
    depositor = new DepositorEntity(depositorId);
    depositor.depositor = event.params.recipient;
    depositor.yieldToken = event.params.yieldToken.toHexString();
    depositor.totalUnderlyingTokenEarned = BigDecimal.fromString("0");
    depositor.totalDonationsReceived = BigDecimal.fromString("0");
  }
  depositor.save();
}

/**
 * Handles the Harvest event from the AlchemistV2 contract
 * Records harvest events and calculates individual user shares of the harvest
 * based on their proportion of total shares
 * @param event The Harvest event containing harvest details and yield token information
 */
export function handleHarvest(event: HarvestEvent): void {
  let harvestId = event.transaction.hash.toHexString();
  let harvest = new HarvestEventEntity(harvestId);

  // Store harvest event details
  harvest.blockNumber = event.block.number;
  harvest.yieldToken = event.params.yieldToken.toHexString();
  harvest.totalHarvested = event.params.totalHarvested;
  harvest.credit = event.params.credit;
  harvest.save();

  let contract = AlchemistV2.bind(event.address);
  let yieldToken = YieldTokenEntity.load(event.params.yieldToken.toHexString());
  if (yieldToken == null) return;

  // Get protocol fee
  let protocolFee = contract.protocolFee();
  let protocolFeeDecimal = protocolFee
    .toBigDecimal()
    .div(BigDecimal.fromString("10000"));

  // Get total shares for calculating individual proportions
  let params = contract.getYieldTokenParameters(event.params.yieldToken);
  let totalShares = params.totalShares;

  // Process harvest distribution for all depositors
  let yieldTokenEntity = YieldTokenEntity.load(harvest.yieldToken)!;
  let depositors = yieldTokenEntity.depositors.load();
  for (let i = 0; i < depositors.length; i++) {
    let depositorAddr = depositors[i].depositor;
    let position = contract.positions(
      Address.fromBytes(depositorAddr),
      event.params.yieldToken
    );

    // Skip users with no shares
    if (position.getShares().equals(BigInt.fromI32(0))) continue;

    // Create user share record
    let shareId = harvestId + "-" + depositorAddr.toHexString();
    let userShare = new UserHarvestShareEntity(shareId);

    userShare.depositor = depositorAddr.toHexString();
    userShare.yieldToken = event.params.yieldToken.toHexString();
    userShare.harvestEvent = harvestId;
    userShare.shares = position.getShares();
    userShare.totalAlchemistShares = totalShares;

    // Calculate user's earnings based on their share ratio
    let shareRatio = position
      .getShares()
      .toBigDecimal()
      .div(totalShares.toBigDecimal());
    let harvestedAmount = event.params.totalHarvested.toBigDecimal();
    let userEarnings = harvestedAmount
      .times(BigDecimal.fromString("1").minus(protocolFeeDecimal))
      .times(shareRatio);
    userShare.userEarnings = userEarnings.div(
      BigInt.fromString("10")
        .pow(yieldToken.decimals as u8)
        .toBigDecimal()
    );

    userShare.blockNumber = event.block.number;
    userShare.save();

    // Update depositor's cumulative earnings
    let depositor = DepositorEntity.load(
      depositorAddr.toHexString() + "-" + event.params.yieldToken.toHexString()
    );
    if (depositor) {
      depositor.totalUnderlyingTokenEarned =
        depositor.totalUnderlyingTokenEarned.plus(userShare.userEarnings);
      depositor.save();
    }
  }
}

/**
 * Handles the Donate event from the AlchemistV2 contract
 * Records donation events and calculates individual user shares of the donation
 * based on their proportion of total shares
 * @param event The Donate event containing donation details and yield token information
 */
export function handleDonate(event: DonateEvent): void {
  let donateId = event.transaction.hash.toHexString();
  let donate = new DonateEventEntity(donateId);

  // Store donation event details
  donate.blockNumber = event.block.number;
  donate.yieldToken = event.params.yieldToken.toHexString();
  donate.debtTokensBurned = event.params.amount;
  donate.save();

  let contract = AlchemistV2.bind(event.address);
  let yieldToken = YieldTokenEntity.load(event.params.yieldToken.toHexString());
  if (yieldToken == null) return;

  // Get total shares for calculating individual proportions
  let params = contract.getYieldTokenParameters(event.params.yieldToken);
  let totalShares = params.totalShares;

  // Process donation distribution for all depositors
  let yieldTokenEntity = YieldTokenEntity.load(donate.yieldToken)!;
  let depositors = yieldTokenEntity.depositors.load();
  for (let i = 0; i < depositors.length; i++) {
    let depositorAddr = depositors[i].depositor;
    let position = contract.positions(
      Address.fromBytes(depositorAddr),
      event.params.yieldToken
    );

    // Skip users with no shares
    if (position.getShares().equals(BigInt.fromI32(0))) continue;

    // Create user donation share record
    let shareId = donateId + "-" + depositorAddr.toHexString();
    let userShare = new UserDonateShareEntity(shareId);

    userShare.depositor = depositorAddr.toHexString();
    userShare.yieldToken = event.params.yieldToken.toHexString();
    userShare.donateEvent = donateId;
    userShare.shares = position.getShares();
    userShare.totalAlchemistShares = totalShares;

    // Calculate user's donation share based on their share ratio
    let shareRatio = position
      .getShares()
      .toBigDecimal()
      .div(totalShares.toBigDecimal());
    let donatedAmount = event.params.amount.toBigDecimal();
    let donationReceived = donatedAmount.times(shareRatio);
    userShare.donationReceived = donationReceived.div(
      BigInt.fromI32(10)
        .pow(18) // Donations are always done with alETH/alUSD (18 decimals)
        .toBigDecimal()
    );

    userShare.blockNumber = event.block.number;
    userShare.save();

    // Update depositor's cumulative donations received
    let depositor = DepositorEntity.load(
      depositorAddr.toHexString() + "-" + event.params.yieldToken.toHexString()
    );
    if (depositor) {
      depositor.totalDonationsReceived = depositor.totalDonationsReceived.plus(
        userShare.donationReceived
      );
      depositor.save();
    }
  }
}
