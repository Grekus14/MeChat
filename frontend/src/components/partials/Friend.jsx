import React from "react";

function Friend() {
	return (
		<li className="friend">
			<img
				src={require("../../images/uploads/undefined-avatar.jpg")}
				alt="user avatar"
			/>
			<span>
				<p className="friend-name">Michael Jackson</p>
				<p className="last-message">Hey man whatsup!</p>
			</span>
		</li>
	);
}

export default Friend;
