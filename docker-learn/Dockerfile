# The image used in chapters 01-07.
#
# This is the "final" Dockerfile for the course: a single-stage build that
# runs as non-root. Chapter 13 makes it multi-stage, and chapter 14 adds a
# HEALTHCHECK. For now, every instruction here is explained in chapter 08.
#
# Build it:
#   docker build -t docker-learn:1.0.0 .
#
# Run it:
#   docker run -d --name dl -p 3000:3000 --init docker-learn:1.0.0
#   curl -s http://localhost:3000/

# Base image. Pinned to a specific version, never `latest`.
# `alpine` is a minimal Linux. `22` is the Node major version.
FROM node:22-alpine

# Set the working directory for all later instructions. Docker creates it if
# it does not exist.
WORKDIR /app

# Copy package.json before the source files.
# This ordering is not a style choice: it makes this layer reusable when only
# server.js changes. Chapter 09 explains the caching behaviour in full.
COPY package.json ./

# Copy the application source.
COPY server.js ./

# Non-secret configuration defaults. These are baked into the image and can be
# overridden at run time with -e or --env-file.
# Note the backslash line-continuation and the mandatory quotes around 3000 --
# without them, "PORT=3000" would be parsed as a build directive, not as a value.
ENV APP_NAME=docker-learn \
    APP_ENV=production \
    PORT=3000

# Documentation only. EXPOSE does NOT publish the port. You still need
# docker run -p or compose ports. Chapter 07 proves this.
EXPOSE 3000

# Run as a non-root user.
# The node:22-alpine image already contains a `node` user (uid 1000), so this
# needs no extra setup. Everything from here on runs as uid 1000, not root.
# Chapter 19 covers why this matters.
USER node

# The default command, in EXEC (JSON) form.
# Exec form is the correct choice here. `docker build --check` on Docker Engine
# 29.8.2 emits a JSONArgsRecommended warning for shell form, because shell form
# makes the shell PID 1 and breaks signal handling. Chapter 10 is entirely
# about this.
CMD ["node", "server.js"]