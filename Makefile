# Makefile for managing Docker container operations

NODE_ENV ?= development
PROJECT_NAME := task-manager-bot
RUN := run --rm

ifeq ($(USE_NFSMOUNT), true)
	DOCKER_COMPOSE_FILES := -f docker-compose.yml -f docker-compose.nfsmount.yml
else
	DOCKER_COMPOSE_FILES := -f docker-compose.yml
endif

ifneq ("$(wildcard ./docker-compose.override.yml)","")
	DOCKER_COMPOSE_FILES := $(DOCKER_COMPOSE_FILES) -f docker-compose.override.yml
endif

DOCKER_COMPOSE := docker-compose $(DOCKER_COMPOSE_FILES) --project-name $(PROJECT_NAME)
DOCKER_COMPOSE_RUN := $(DOCKER_COMPOSE) $(RUN)

provision: rebuild-docker install build migrate

sh:
	${DOCKER_COMPOSE_RUN} -e "NODE_ENV=${NODE_ENV}" app /bin/sh
	
run:
	${DOCKER_COMPOSE_RUN} -e "NODE_ENV=${NODE_ENV}" --service-ports db

down:
	${DOCKER_COMPOSE} down

build:
	${DOCKER_COMPOSE} build

install:
	${DOCKER_COMPOSE_RUN} -e "NODE_ENV=${NODE_ENV}" app npm install 

app:
	${DOCKER_COMPOSE_RUN} -e "NODE_ENV=${NODE_ENV}" --service-ports app

migrate:
	${DOCKER_COMPOSE_RUN} -e "NODE_ENV=${NODE_ENV}" app npm run migration:up

down:
	${DOCKER_COMPOSE} down

down-v:
	${DOCKER_COMPOSE} down -v

migration-generate:
	${DOCKER_COMPOSE_RUN} -e "NODE_ENV=${NODE_ENV}" app npm run migration:generate ./db/migrations/$(name)

migration-create:
	${DOCKER_COMPOSE_RUN} -e "NODE_ENV=${NODE_ENV}" app npm run migration:create ./db/migrations/$(name)

migration-up:
	${DOCKER_COMPOSE_RUN} -e "NODE_ENV=${NODE_ENV}" app npm run migration:up

migration-down:
	${DOCKER_COMPOSE_RUN} -e "NODE_ENV=${NODE_ENV}" app npm run migration:down

rebuild-docker:
	${DOCKER_COMPOSE} stop app
	${DOCKER_COMPOSE} rm -f app
