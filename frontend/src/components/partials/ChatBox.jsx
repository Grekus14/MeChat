import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import io from "socket.io-client";
import axiosApp from "../../utils/axiosConfig";
import PageLoading from "./PageLoading";

let socket;

function ChatBox(props) {
	const [messages, setMessages] = useState("loading");
	const [newMessage, setNewMessage] = useState("");
	const messagesEnd = document.getElementById("lastMessage");

	useEffect(() => {
		socket = io("me-chat.herokuapp.com");

		socket.emit("join", { name: props.username, room: props.chatRoomId });

		return () => {
			socket.emit("disconnect");

			socket.off();
		};
	}, []);

	useEffect(() => {
		socket.on("message", message => {
			setMessages(prev => [...prev, message]);
		});
	}, []);

	useEffect(() => {
		setMessages("loading");
		async function getOldMessages() {
			setMessages(
				(
					await axiosApp.get("/chat/get-messages/" + props.id, {
						withCredentials: true
					})
				).data.messages
			);
		}

		getOldMessages();
	}, [props.id]);

	function sendMessage() {
		if (
			messages === "loading" ||
			newMessage.split(" ").find(msg => msg.length > 15)
		) {
			setNewMessage("");
			alert("Word in message too long!");
			return;
		}

		if (newMessage.length) {
			socket.emit("sendMessage", {
				text: newMessage,
				author: props.myData.id
			});
			setNewMessage("");
		}
	}

	function renderMessages() {
		return messages.map((message, index) => (
			<p
				className={
					(message.author === props.myData.id
						? "my-message"
						: "friend-message") +
					(index === 0
						? ""
						: messages[index - 1].author !== message.author
						? " new-sender"
						: "")
				}>
				{message.text}
			</p>
		));
	}

	function scrollToBottom(behavior) {
		if (messagesEnd) messagesEnd.scrollIntoView({ behavior: behavior });
	}

	useEffect(() => {
		scrollToBottom("instant");
	}, [messages]);

	return (
		<div className="chat-box-container">
			<nav className="nav-mobile-chat nav-mobile">
				<a onClick={props.closeChat} className="hide-desktop">
					<img
						src={require("../../images/assets/Back.svg")}
						alt="back icon"
					/>
				</a>
				<a onClick={props.closeChat} className="hide-mobile chat-minimize">
					<img
						src={require("../../images/assets/Cancel D White.svg")}
						alt="minimize icon"
					/>
				</a>
				<span className="friend-chat">
					<p>{props.username}</p>
					<Link to={"/profile/" + props.id}>
						<img
							className="friend-chat-avatar"
							src={
								"https://mechat-profile-images.s3.eu-west-2.amazonaws.com/" +
								props.avatar
							}
							alt="friend profile picture"
						/>
					</Link>
				</span>
			</nav>

			<div className="chat-container">
				{messages === "loading" ? <PageLoading /> : renderMessages()}
				<div id="lastMessage"></div>
			</div>

			<div className="send-message-container">
				<input
					onChange={e => setNewMessage(e.target.value)}
					onKeyPress={e => {
						if (e.key === "Enter") sendMessage();
					}}
					type="text"
					autoComplete="off"
					autoFocus
					placeholder="Type Message"
					value={newMessage}
				/>
				<button onClick={sendMessage}>
					<img src={require("../../images/assets/Send.svg")} />
				</button>
			</div>
		</div>
	);
}

export default ChatBox;
