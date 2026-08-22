.PHONY: infra dev seed clean reset help

## Boot all containers, run DB migrations, and seed dev users
infra:
	docker compose up -d
	@printf 'Waiting for Postgres'
	@until docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1; do \
		printf '.'; sleep 1; \
	done
	@echo ' ready'
	npx prisma migrate dev --name init
	$(MAKE) seed
	@echo ''
	@echo 'Infra ready. Run: make dev'

## Start Next.js dev server on localhost:3000
dev:
	npm run dev

## Seed dev accounts (admin@example.com)
seed:
	npx tsx prisma/seed.ts

## Stop containers (keeps volumes)
clean:
	docker compose down

## Stop containers and wipe DB volumes
reset:
	docker compose down -v
	@echo 'DB wiped. Run: make infra'

## Show available commands
help:
	@echo ''
	@echo 'Usage: make <target>'
	@echo ''
	@grep -E '^## ' Makefile | sed 's/## /  /' | paste - <(grep -E '^[a-zA-Z_-]+:' Makefile | sed 's/:.*//')  | awk '{print "  " $$NF "\t" $$0}' || \
	grep -A1 '^## ' Makefile | grep -v '^--$$' | paste - - | sed 's/## //' | awk -F'\t' '{printf "  %-10s %s\n", $$2, $$1}'
	@echo ''

.DEFAULT_GOAL := help
