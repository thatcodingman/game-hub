#!/bin/bash
# Usage: ./deploy.sh "your commit message"
# Adds, commits, and pushes everything in one shot.

MSG="${1:-Update}"

git add .
git commit -m "$MSG"
git push
