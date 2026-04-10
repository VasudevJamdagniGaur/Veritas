// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract VeritasTrust {
    mapping(address => bool) public verifiedUsers;
    mapping(address => uint256) public trustScore;

    event UserVerified(address indexed user);
    event TrustScoreUpdated(address indexed user, uint256 score);

    function setVerified(address user, bool verified) external {
        verifiedUsers[user] = verified;
        emit UserVerified(user);
    }

    function setTrustScore(address user, uint256 score) external {
        require(score <= 100, "score out of range");
        trustScore[user] = score;
        emit TrustScoreUpdated(user, score);
    }
}

