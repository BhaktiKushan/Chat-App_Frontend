import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import io from 'socket.io-client';
import { useNavigate } from 'react-router-dom';

const ENDPOINT = 'https://chat-app-backend-drnx.onrender.com';
let socket;

const ChatPage = () => {
  const { user, logout } = useAuth();
  const [chats, setChats] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [typing, setTyping] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isMobile, setIsMobile] = useState(false);
  const [activeSection, setActiveSection] = useState('chats');
  const navigate = useNavigate();
  const typingTimeout = useRef(null);

  // Check if mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    socket = io(ENDPOINT);

    socket.emit('setup', user);
    socket.on('connected', () => console.log("🔌 Socket connected"));

    // ✅ Receive real-time online users
    socket.on('online-users', (onlineUserIds) => {
      setOnlineUsers(onlineUserIds);
    });

    // ✅ Typing indicators
    socket.on('typing', () => setIsTyping(true));
    socket.on('stop typing', () => setIsTyping(false));

    return () => {
      socket.disconnect();
      socket.off('online-users');
      socket.off('typing');
      socket.off('stop typing');
    };
  }, [user]);

  useEffect(() => {
    const fetchChats = async () => {
      try {
        const { data } = await axios.get(`${ENDPOINT}/api/chat`, {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        setChats(data);
      } catch (err) {
        console.error("❌ Failed to load chats", err);
      }
    };
    fetchChats();
  }, [user.token]);

  useEffect(() => {
    const fetchAllUsers = async () => {
      try {
        const { data } = await axios.get(`${ENDPOINT}/api/user`, {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        setAllUsers(data);
      } catch (err) {
        console.error("❌ Failed to load users", err);
      }
    };
    fetchAllUsers();
  }, [user.token]);

  useEffect(() => {
    const fetchMessages = async () => {
      if (!selectedChat) return;
      try {
        const { data } = await axios.get(`${ENDPOINT}/api/message/${selectedChat._id}`, {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        setMessages(data);
        socket.emit('join chat', selectedChat._id);
      } catch (err) {
        console.error("❌ Failed to load messages", err);
      }
    };
    fetchMessages();
  }, [selectedChat, user.token]);

  useEffect(() => {
    const messageHandler = (newMsg) => {
      if (!selectedChat || newMsg.chat._id !== selectedChat._id) return;
      setMessages((prev) => [...prev, newMsg]);
    };
    socket.on('message received', messageHandler);
    return () => socket.off('message received', messageHandler);
  }, [selectedChat]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    socket.emit('stop typing', selectedChat._id);
    setTyping(false);

    try {
      const { data } = await axios.post(
        `${ENDPOINT}/api/message`,
        { content: newMessage, chatId: selectedChat._id },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      setMessages([...messages, data]);
      socket.emit('new message', data);
      setNewMessage('');
    } catch (err) {
      console.error("❌ Failed to send message", err);
    }
  };

  const handleTyping = (e) => {
    setNewMessage(e.target.value);

    if (!socket.connected || !selectedChat) return;

    if (!typing) {
      setTyping(true);
      socket.emit('typing', selectedChat._id);
    }

    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit('stop typing', selectedChat._id);
      setTyping(false);
    }, 2000);
  };

  const accessOrCreateChat = async (userId) => {
    try {
      const { data } = await axios.post(
        `${ENDPOINT}/api/chat`,
        { userId },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );

      if (!chats.find((c) => c._id === data._id)) {
        setChats([data, ...chats]);
      }
      setSelectedChat(data);
    } catch (err) {
      console.error("❌ Error creating/accessing chat", err);
    }
  };

  const logoutHandler = () => {
    logout();
    navigate('/login');
  };

  const isUserOnline = (id) => onlineUsers.includes(id);

  const handleBackToChats = () => {
    setSelectedChat(null);
  };

  const handleChatSelect = (chat) => {
    setSelectedChat(chat);
  };

  return (
    <div className={`chat-container ${selectedChat ? 'has-selected-chat' : ''}`}>
      <div className={`chat-sidebar ${isMobile && selectedChat ? 'mobile-hide' : ''}`}>
        <div className="chat-header">
          <div className="chat-header-top">
            <h3>Chat App</h3>
            <button onClick={logoutHandler} className="logout-btn">Logout</button>
          </div>
          <div className="chat-toggle-buttons">
            <button 
              className={`toggle-btn ${activeSection === 'chats' ? 'active' : ''}`}
              onClick={() => setActiveSection('chats')}
            >
              Your Chats
            </button>
            <button 
              className={`toggle-btn ${activeSection === 'users' ? 'active' : ''}`}
              onClick={() => setActiveSection('users')}
            >
              Start New Chat
            </button>
          </div>
        </div>

        <div className="chat-list">
          {/* Your Chats Section */}
          <div className={`chat-section ${activeSection === 'chats' ? 'active' : ''}`}>
            <div className="chat-items-container">
              {chats.length > 0 ? (
                chats.map((chat) => {
                  const otherUser = chat.users.find((u) => u._id !== user._id);
                  return (
                    <div
                      key={chat._id}
                      className={`chat-item ${selectedChat?._id === chat._id ? 'active' : ''}`}
                      onClick={() => handleChatSelect(chat)}
                    >
                      {chat.isGroupChat ? chat.chatName : (
                        <>
                          {otherUser.name}
                          {isUserOnline(otherUser._id) && <span className="online-dot" />}
                        </>
                      )}
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.7)' }}>
                  No chats yet. Start a new conversation!
                </div>
              )}
            </div>
          </div>

          {/* Start New Chat Section */}
          <div className={`chat-section ${activeSection === 'users' ? 'active' : ''}`}>
            <div className="users-items-container">
              {allUsers
                .filter((u) => u._id !== user._id)
                .map((u) => (
                  <div key={u._id} className="user-item" onClick={() => accessOrCreateChat(u._id)}>
                    {u.name} {isUserOnline(u._id) && <span className="online-dot" />}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      <div className={`chat-box ${selectedChat ? 'chat-selected' : 'chat-not-selected'}`}>
        {selectedChat ? (
          <>
            <button className="back-btn" onClick={handleBackToChats}>← Back</button>
            <div className="messages">
              {messages.map((msg) => (
                <div
                  key={msg._id}
                  className={`message ${msg.sender._id === user._id ? 'own' : ''}`}
                >
                  <span>{msg.sender.name}</span>
                  <p>{msg.content}</p>
                </div>
              ))}
              {isTyping && (
                <div className="message typing-indicator">
                  <span>Typing...</span>
                </div>
              )}
            </div>
            <form className="message-form" onSubmit={sendMessage}>
              <input
                type="text"
                placeholder="Type a message..."
                value={newMessage}
                onChange={handleTyping}
              />
              <button type="submit">Send</button>
            </form>
          </>
        ) : (
          <div className="no-chat">Select a chat to start messaging</div>
        )}
      </div>
    </div>
  );
};

export default ChatPage;