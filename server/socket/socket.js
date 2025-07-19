import dotenv from "dotenv";
dotenv.config();

import { Server } from "socket.io";
import http from "http";
import express from "express";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
  },
});

// userId → Set of socketIds
const userSocketMap = new Map();

const getAllOnlineUsers = () => Array.from(userSocketMap.keys());

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;
  if (!userId) return;

  // Add socket.id to the user's set
  if (!userSocketMap.has(userId)) {
    userSocketMap.set(userId, new Set());
  }
  userSocketMap.get(userId).add(socket.id);

  // Notify all clients of the updated online users list
  io.emit("onlineUsers", getAllOnlineUsers());

  console.log(`[connected] userId=${userId}, socketId=${socket.id}`);

  // === Chat event ===
  socket.on("sendMessage", ({ to, message }) => {
    const targetSockets = userSocketMap.get(to);
    if (targetSockets) {
      targetSockets.forEach((sid) => {
        io.to(sid).emit("receiveMessage", {
          from: userId,
          message,
        });
      });
    } else {
      socket.emit("userUnavailable", { to });
    }
  });

  // === WebRTC signaling events ===
  socket.on("callUser", ({ to, offer, callType }) => {
    const targetSockets = userSocketMap.get(to);
    if (targetSockets) {
      targetSockets.forEach((sid) => {
        io.to(sid).emit("incomingCall", {
          from: userId,
          offer,
          callType,
        });
      });
    } else {
      socket.emit("userUnavailable", { to });
    }
  });

  socket.on("answerCall", ({ to, answer }) => {
    const targetSockets = userSocketMap.get(to);
    if (targetSockets) {
      targetSockets.forEach((sid) => {
        io.to(sid).emit("callAnswered", {
          from: userId,
          answer,
        });
      });
    }
  });

  socket.on("iceCandidate", ({ to, candidate }) => {
    const targetSockets = userSocketMap.get(to);
    if (targetSockets) {
      targetSockets.forEach((sid) => {
        io.to(sid).emit("iceCandidate", {
          from: userId,
          candidate,
        });
      });
    }
  });

  socket.on("endCall", ({ to }) => {
    const targetSockets = userSocketMap.get(to);
    if (targetSockets) {
      targetSockets.forEach((sid) => {
        io.to(sid).emit("callEnded", {
          from: userId,
        });
      });
    }
  });

  // === Handle disconnect ===
  socket.on("disconnect", () => {
    console.log(`[disconnected] userId=${userId}, socketId=${socket.id}`);

    const userSockets = userSocketMap.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        userSocketMap.delete(userId);
      }
    }

    // Notify all clients of updated online users list
    io.emit("onlineUsers", getAllOnlineUsers());
  });
});

// Utility function to get all socketIds of a user
const getSocketIds = (userId) => {
  return userSocketMap.get(userId) ? Array.from(userSocketMap.get(userId)) : [];
};

export { io, app, server, getSocketIds };
