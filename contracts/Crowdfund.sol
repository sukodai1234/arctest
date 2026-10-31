// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title All-or-nothing USDC crowdfunding
/// @notice Permissionless campaigns without administrative powers or fees.
/// @dev Intended for Arc Testnet (5042002), using 6-decimal USDC amounts.
contract Crowdfund is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Campaign {
        address creator;
        address beneficiary;
        uint256 goal;
        uint64 deadline;
        uint256 raised;
        string title;
        bool withdrawn;
        bool cancelled;
    }

    error ZeroAddress();
    error InvalidGoal();
    error InvalidTitle();
    error InvalidDeadline();
    error InvalidAmount();
    error CampaignNotFound(uint256 id);
    error CampaignCancelled();
    error AlreadyWithdrawn();
    error DeadlinePassed();
    error GoalNotReached();
    error WithdrawWindowClosed();
    error RefundUnavailable();
    error NothingToRefund();
    error NotCreator();

    /// @notice Time after a campaign's deadline before withdrawals close and recovery refunds open.
    uint64 public constant RECOVERY_PERIOD = 30 days;

    /// @notice The ERC-20 USDC interface used for all contributions and payouts.
    IERC20 public immutable usdc;

    uint256 private _campaignCount;
    mapping(uint256 => Campaign) private _campaigns;
    mapping(uint256 => mapping(address => uint256)) private _contributions;

    /// @notice Emitted when a campaign is created; amounts use USDC base units.
    event CampaignCreated(
        uint256 indexed id,
        address indexed creator,
        address beneficiary,
        uint256 goal,
        uint64 deadline,
        string title
    );

    /// @notice Emitted with the actual amount received and cumulative campaign funding.
    event Contributed(uint256 indexed id, address indexed contributor, uint256 amount, uint256 raised);

    /// @notice Emitted when the complete campaign funding is paid to its beneficiary.
    event Withdrawn(uint256 indexed id, address indexed beneficiary, uint256 amount);

    /// @notice Emitted when a contributor claims their full refundable contribution.
    event Refunded(uint256 indexed id, address indexed contributor, uint256 amount);

    /// @notice Emitted when the creator cancels a campaign and enables refunds.
    event Cancelled(uint256 indexed id);

    /// @notice Emitted when the creator changes the campaign's payout address.
    event BeneficiaryUpdated(uint256 indexed id, address indexed newBeneficiary);

    /// @notice Sets the USDC token interface; no owner or administrative role is created.
    /// @param usdc_ On Arc Testnet, use 0x3600000000000000000000000000000000000000.
    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
    }

    /// @notice Creates a campaign with a deadline within the next 365 days.
    /// @param title A title of 1 through 80 bytes.
    /// @param beneficiary The nonzero address that will receive a successful campaign's funds.
    /// @param goal The positive funding target in USDC base units (1 USDC = 1e6).
    /// @param deadline The future Unix timestamp at which contributions close.
    /// @return id The new campaign ID, starting at 1.
    function createCampaign(string calldata title, address beneficiary, uint256 goal, uint64 deadline)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (beneficiary == address(0)) revert ZeroAddress();
        if (goal == 0) revert InvalidGoal();
        if (bytes(title).length == 0 || bytes(title).length > 80) revert InvalidTitle();
        if (deadline <= block.timestamp || uint256(deadline) - block.timestamp > 365 days) {
            revert InvalidDeadline();
        }

        id = ++_campaignCount;
        _campaigns[id] = Campaign(msg.sender, beneficiary, goal, deadline, 0, title, false, false);
        emit CampaignCreated(id, msg.sender, beneficiary, goal, deadline, title);
    }

    /// @notice Pulls approved USDC and credits only the balance increase; overfunding is allowed.
    /// @param id An existing, active campaign ID.
    /// @param amount The positive amount to request from the caller, in USDC base units.
    function contribute(uint256 id, uint256 amount) external nonReentrant {
        Campaign storage campaign = _getCampaign(id);
        _requireActive(campaign);
        if (block.timestamp >= campaign.deadline) revert DeadlinePassed();
        if (amount == 0) revert InvalidAmount();

        // Receipt must be measured before accounting. All mutating entry points share the guard.
        uint256 balanceBefore = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = usdc.balanceOf(address(this)) - balanceBefore;
        _contributions[id][msg.sender] += received;
        campaign.raised += received;
        emit Contributed(id, msg.sender, received, campaign.raised);
    }

    /// @notice Anyone may pay a successful campaign's entire raised amount to its beneficiary.
    /// @dev Withdrawals close at the deadline plus RECOVERY_PERIOD, when recovery refunds open.
    /// @param id An existing campaign ID; withdrawal can occur before or after its deadline within this window.
    function withdraw(uint256 id) external nonReentrant {
        Campaign storage campaign = _getCampaign(id);
        _requireActive(campaign);
        if (block.timestamp >= uint256(campaign.deadline) + RECOVERY_PERIOD) revert WithdrawWindowClosed();
        if (campaign.raised < campaign.goal) revert GoalNotReached();

        campaign.withdrawn = true;
        uint256 amount = campaign.raised;
        address beneficiary = campaign.beneficiary;
        usdc.safeTransfer(beneficiary, amount);
        emit Withdrawn(id, beneficiary, amount);
    }

    /// @notice Refunds the caller after cancellation, an unsuccessful campaign's deadline, or the recovery window.
    /// @dev Any unwithdrawn campaign permits refunds at its deadline plus RECOVERY_PERIOD, without creator action.
    /// @dev Raised remains the cumulative amount received, not the remaining escrow balance.
    /// @param id An existing campaign ID with refunds enabled.
    function refund(uint256 id) external nonReentrant {
        Campaign storage campaign = _getCampaign(id);
        if (campaign.withdrawn) revert AlreadyWithdrawn();
        if (
            !campaign.cancelled && (block.timestamp < campaign.deadline || campaign.raised >= campaign.goal)
                && block.timestamp < uint256(campaign.deadline) + RECOVERY_PERIOD
        ) {
            revert RefundUnavailable();
        }
        uint256 amount = _contributions[id][msg.sender];
        if (amount == 0) revert NothingToRefund();

        _contributions[id][msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit Refunded(id, msg.sender, amount);
    }

    /// @notice Allows only the creator to cancel an unwithdrawn campaign, enabling refunds immediately.
    /// @param id An existing campaign ID that has not already been cancelled.
    function cancel(uint256 id) external nonReentrant {
        Campaign storage campaign = _getCampaign(id);
        if (msg.sender != campaign.creator) revert NotCreator();
        _requireActive(campaign);
        campaign.cancelled = true;
        emit Cancelled(id);
    }

    /// @notice Allows only the creator to replace an active campaign's beneficiary, e.g. if blocked by USDC.
    /// @dev Does not change the deadline or extend the withdrawal and recovery window.
    /// @param id An existing campaign ID that is neither cancelled nor withdrawn.
    /// @param newBeneficiary The nonzero replacement payout address.
    function updateBeneficiary(uint256 id, address newBeneficiary) external nonReentrant {
        Campaign storage campaign = _getCampaign(id);
        if (msg.sender != campaign.creator) revert NotCreator();
        _requireActive(campaign);
        if (newBeneficiary == address(0)) revert ZeroAddress();
        campaign.beneficiary = newBeneficiary;
        emit BeneficiaryUpdated(id, newBeneficiary);
    }

    /// @notice Returns the total number of campaigns created; valid IDs are 1 through this value.
    function campaignCount() external view returns (uint256) {
        return _campaignCount;
    }

    /// @notice Returns an account's credited contribution, zero after refund or for an unknown ID.
    /// @dev Successful withdrawal leaves historical contribution credits intact, but disables refunds.
    function contributionOf(uint256 id, address account) external view returns (uint256) {
        return _contributions[id][account];
    }

    /// @notice Returns all campaign fields; reverts for an unknown ID.
    /// @dev Raised is cumulative funding, including amounts subsequently refunded or withdrawn.
    function getCampaign(uint256 id) external view returns (Campaign memory) {
        return _getCampaign(id);
    }

    function _getCampaign(uint256 id) private view returns (Campaign storage campaign) {
        if (id == 0 || id > _campaignCount) revert CampaignNotFound(id);
        campaign = _campaigns[id];
    }

    function _requireActive(Campaign storage campaign) private view {
        if (campaign.withdrawn) revert AlreadyWithdrawn();
        if (campaign.cancelled) revert CampaignCancelled();
    }
}
