# Contents
- [About](#about)
- [Local Usage](#local-usage)

## About
Personal telegram bot to manage tasks on a project.

### Tech Stack

- **NestJS**  
  - A progressive Node.js framework for building efficient, reliable, and scalable server-side applications.

- **TypeORM**  
  - An ORM that can run in Node.js, providing an elegant and intuitive way to interact with databases using TypeScript and JavaScript.

- **PostgreSQL**  
  - An advanced open-source relational database system, known for its robustness, extensibility, and standards compliance.

- **Docker**  
  - A platform designed to create, deploy, and run applications inside containers, enabling easier application management and scaling.

## Local Usage

### 1. Requirements

* [Docker & Docker compose](https://docs.docker.com/compose/install/)

### 2. Installation

#### Preparation

First of all, configure environment variables

```bash
cp .env.development .env.development.local
```
Then set your environments (you can use any text editor)

#### Launch provisioning(install packages, run migrations, etc.)

```bash
make provision
```

### 3. Usage

#### Run app

```bash
make app
```

#### Migrations

##### Create migration

```bash
make migration-create name=create-users
```

##### Apply migrations

```bash
make migration-up
```

##### Revert migration

```bash
make migration-down
```

#### Stop

##### Stop and keep data

```bash
make down
```

##### Stop and clear data

```bash
make down-v
```
