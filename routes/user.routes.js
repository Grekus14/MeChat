const router = require("express").Router();
const bcrypt = require("bcrypt");
const User = require("../models/user.model");
const ChatRoom = require("../models/chatRoom.model");
const aws = require("aws-sdk");
const mongoose = require("mongoose");

// ################################# ROUTES #################################

// Register a new user
router.post("/register", async (req, res) => {
	try {
		const username = req.body.username;
		const password = await bcrypt.hash(req.body.password, 10);

		const newUser = new User({
			username: username,
			password: password
		});

		await newUser.save();

		req.session.myId = newUser._id;
		req.session.myAvatar = newUser.avatar;

		res.status(200).send("Logged in as " + username);
	} catch (err) {
		if (err.code === 11000) res.status(403).send("Username already taken.");
		else res.send(err);
	}
});

// Login
router.post("/login", async (req, res) => {
	username = req.body.username;
	password = req.body.password;

	const user = await User.findOne({ username: username });
	if (!user) {
		res.status(401).send("Incorrect username.");
		return;
	}

	if (await bcrypt.compare(password, user.password)) {
		req.session.myId = user._id;
		req.session.myAvatar = user.avatar;

		res.status(200).send("Logged in as " + username);
	} else {
		res.status(401).send("Incorrect password.");
	}
});

router.post("/logout", (req, res) => {
	req.session.myId = undefined;
	req.session.myAvatar = undefined;
	res.send("Logged out.");
});

// Get someonse profile info
router.get("/profile/:userId", async (req, res) => {
	try {
		const user = await User.findById(req.params.userId);

		if (!user) throw new Error(404, "User not found.");

		user.password = undefined;
		res.send(user);
	} catch (err) {
		res.send(err);
	}
});

// Get ID & Avatar of currently logged in user
router.get("/status", (req, res) => {
	const data = {
		id: req.session.myId,
		avatar: req.session.myAvatar
	};
	if (data.id === undefined || data.avatar === undefined) {
		res.status(401).send("You need to login.");
	} else {
		res.send(data);
	}
});

// Send friend request
router.post("/send-request/:userId", async (req, res) => {
	const myId = req.session.myId;
	const otherUserId = req.params.userId;

	// Check if users are already friends or pending
	const me = await User.findById(myId);
	if (
		Boolean(me.friends.find(friend => String(friend.userId) === otherUserId))
	) {
		res.status(400).send("Can't send request.");
		return;
	}

	// Send request
	await Promise.all([
		User.findByIdAndUpdate(myId, {
			$push: {
				friends: {
					userId: otherUserId,
					status: "pending",
					sentByMe: true
				}
			}
		}),
		User.findByIdAndUpdate(otherUserId, {
			$push: {
				friends: {
					userId: myId,
					status: "pending",
					sentByMe: false
				}
			}
		})
	]);

	res.send("Friend request sent!");
});

// Accept friend request
router.post("/accept/:userId", async (req, res) => {
	const myId = req.session.myId;
	const otherUserId = req.params.userId;

	// Validate friend request
	const me = await User.findById(myId);
	const otherUser = me.friends.find(
		friend => String(friend.userId) === otherUserId
	);

	if (
		!Boolean(otherUser) ||
		otherUser.sentByMe ||
		otherUser.status !== "pending"
	) {
		res.status(400).send("Can't accept request.");
		return;
	}

	// If request is valid, update Me & otherUsers friends fields

	var newChatRoomId = mongoose.Types.ObjectId();

	const result = await Promise.all([
		User.updateOne(
			{ _id: otherUserId, "friends.userId": myId },
			{
				$set: {
					"friends.$.status": "friends",
					"friends.$.chatRoomId": newChatRoomId
				}
			}
		),
		User.updateOne(
			{ _id: myId, "friends.userId": otherUserId },
			{
				$set: {
					"friends.$.status": "friends",
					"friends.$.chatRoomId": newChatRoomId
				}
			}
		),
		new ChatRoom({ _id: newChatRoomId }).save()
	]);

	res.send(result);
});

// Delete friend
router.post("/unfriend/:userId", async (req, res) => {
	const myId = req.session.myId;

	const targetRoom = (await User.findById(myId)).friends.find(
		friend => String(friend.userId) === req.params.userId
	).chatRoomId;

	const [user, me] = await Promise.all([
		User.updateOne(
			{ _id: req.params.userId },
			{ $pull: { friends: { userId: myId } } }
		),
		User.updateOne(
			{ _id: myId },
			{ $pull: { friends: { userId: req.params.userId } } }
		),
		ChatRoom.findByIdAndRemove(targetRoom)
	]);

	if (user.nModified === 0 || me.nModified === 0) {
		res.status(404).send("User not in friends list.");
		return;
	}

	res.send("Deleted.");
});

// Get a list of friends
// Each friend object contains a chatRoomId, used for private messaging
router.get("/friends", async (req, res) => {
	const myId = req.session.myId;

	if (!myId) {
		res.status(401).send("You need to login.");
		return;
	}

	const myFriends = (await User.findById(myId)).friends.filter(
		friend => friend.status === "friends"
	);

	// Get the User objects based on my friends list
	let users = await User.find({
		_id: {
			$in: myFriends.map(friend => String(friend.userId))
		}
	})
		.select("avatar username")
		.lean();

	// For each user, add a ChatRoomID from a corresponding friend object.
	users = users.map(user => {
		user.chatRoomId = myFriends.find(
			friend => String(friend.userId) === String(user._id)
		).chatRoomId;
		return user;
	});

	res.send(users);
});

// Get pending friend requests
router.get("/requests", async (req, res) => {
	const myId = req.session.myId;

	if (!myId) {
		res.status(401).send("You need to login.");
		return;
	}

	res.send(
		removeUserPassword(
			await User.find({
				_id: {
					$in: (await User.findById(myId)).friends
						.reduce((result, friend) => {
							if (friend.status === "pending" && !friend.sentByMe) {
								result.push(friend);
							}
							return result;
						}, [])
						.map(request => String(request.userId))
				}
			})
		)
	);
});

// Search for users by name
router.get("/find/:username", async (req, res) => {
	const regex = new RegExp(
		req.params.username.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\&&"),
		"gi"
	);
	const users = await User.find({ username: regex });
	res.send(removeUserPassword(users));
});

// Get a signed request for uploading avatar
aws.config.region = "eu-west-2";
router.get("/sign-s3", (req, res) => {
	const S3_BUCKET = process.env.S3_BUCKET;
	const fileName = req.query["file-name"];
	const myId = req.session.myId;
	const s3Params = {
		Bucket: S3_BUCKET,
		Key: myId + "-avatar.jpg",
		Expires: 60,
		CacheControl: "no-cache",
		ContentType: "image/jpeg",
		ACL: "public-read"
	};

	const s3 = new aws.S3({
		accessKeyId: process.env.USER_ACCESS_KEY_ID,
		secretAccessKey: process.env.USER_SECRET_ACCESS_KEY
	});

	s3.getSignedUrl("putObject", s3Params, (err, data) => {
		if (err) {
			console.log(err);
			return res.end();
		}
		const returnData = {
			signedRequest: data,
			url: `https://${S3_BUCKET}.s3.amazonaws.com/${fileName}`
		};

		res.write(JSON.stringify(returnData));
		res.end();
	});
});

router.patch("/update-user-avatar", async (req, res) => {
	const myId = req.session.myId;
	const newAvatarUrl = myId + "-avatar.jpg";
	await User.findOneAndUpdate({ _id: myId }, { avatar: newAvatarUrl });
	req.session.myAvatar = newAvatarUrl;
	res.send();
});

// Processes an array of users and returns them without a password (for security)
function removeUserPassword(users) {
	return users.map(user => {
		user.password = undefined;
		return user;
	});
}

module.exports = router;
