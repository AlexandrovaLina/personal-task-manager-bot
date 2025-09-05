#!/bin/sh -e

psql --variable=ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE "bot_development";
  CREATE DATABASE "bot_test";
EOSQL

psql --variable=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname=bot_development <<-EOSQL
  CREATE EXTENSION "citext";
  CREATE EXTENSION "uuid-ossp";
EOSQL

psql --variable=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname=bot_test <<-EOSQL
  CREATE EXTENSION "citext";
  CREATE EXTENSION "uuid-ossp";
EOSQL
