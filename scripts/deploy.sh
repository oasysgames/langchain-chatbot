#!/bin/bash

# Move to the project directory
cd /home/ubuntu/langchain-chatbot

# Pull the latest updates from the repository
git pull

# Restart the server using systemctl
sudo -S systemctl restart chatsvr
