// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract HydrogenCredit {
	struct Credit {
		string id;
		address issuer;
		address holder;
		uint256 amount;
		uint256 timestamp;
		bool retired;
	}

	Credit[] public credits;
	mapping(string => uint256) public creditIdToIndex; // Map string ID to array index
	mapping(string => bool) public creditExists; // Check if ID already exists

	event CreditIssued(
		string indexed id,
		address indexed issuer,
		uint256 amount
	);
	event CreditTransferred(
		string indexed id,
		address indexed from,
		address indexed to
	);
	event CreditRetired(string indexed id, address indexed holder);

	function issueCredit(string memory id, address to, uint256 amount) public {
		require(!creditExists[id], 'Credit ID already exists');

		credits.push(
			Credit({
				id: id,
				issuer: msg.sender,
				holder: to,
				amount: amount,
				timestamp: block.timestamp,
				retired: false
			})
		);

		// Map the string ID to array index
		creditIdToIndex[id] = credits.length - 1;
		creditExists[id] = true;

		emit CreditIssued(id, msg.sender, amount);
	}

	function transferCredit(string memory creditId, address to) public {
		require(creditExists[creditId], "Credit doesn't exist");
		uint256 index = creditIdToIndex[creditId];
		require(credits[index].holder == msg.sender, 'Not your credit');
		require(!credits[index].retired, 'Credit already retired');

		credits[index].holder = to;
		emit CreditTransferred(creditId, msg.sender, to);
	}

	function retireCredit(string memory creditId) public {
		require(creditExists[creditId], "Credit doesn't exist");
		uint256 index = creditIdToIndex[creditId];
		require(credits[index].holder == msg.sender, 'Not your credit');
		require(!credits[index].retired, 'Already retired');

		credits[index].retired = true;
		emit CreditRetired(creditId, msg.sender);
	}

	function getCredit(
		string memory creditId
	) public view returns (Credit memory) {
		require(creditExists[creditId], "Credit doesn't exist");
		uint256 index = creditIdToIndex[creditId];
		return credits[index];
	}

	function getAllCredits() public view returns (Credit[] memory) {
		return credits;
	}
}
