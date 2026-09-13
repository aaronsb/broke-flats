# Broke Flats tasks. Run `make` for the list.
SHELL := /bin/sh
PORT  := 5173
SHOTS := docs/screenshots

.DEFAULT_GOAL := help
.PHONY: help dev build preview smoke shots playtest-doc with-server

help: ## Show this help
	@echo "Broke Flats"
	@echo
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[1m%-10s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo
	@echo "  smoke takes S=<scenario>: hops (default), train, occupied, night, skies, skid, debug, battle, halt, halt-crash, perks, perks2, barrier, powerups, powerups2, river, logo, poses, burn, phone, tablet, freight, maze, banner, shots"

dev: ## Start the Vite dev server on all interfaces, port 5173
	npx vite --port $(PORT) --strictPort --host 0.0.0.0

build: ## Production build into dist/
	npx vite build

preview: ## Serve the production build
	npx vite preview

smoke: ## Headless runtime check in Chrome (S=<scenario>)
	@$(MAKE) --no-print-directory with-server CMD="scripts/smoke.sh $(or $(S),hops)"

shots: ## Capture a screenshot per view into docs/screenshots and rebuild docs/screenshots.md
	@mkdir -p $(SHOTS)
	@$(MAKE) --no-print-directory with-server CMD="env OUT=$(SHOTS) scripts/smoke.sh shots"
	@node scripts/shots-index.mjs $(SHOTS) > docs/screenshots.md
	@echo "wrote docs/screenshots.md"

playtest-doc: ## Regenerate docs/playtest.md from the game's registries (BASE_URL overrides the site)
	@node scripts/playtest-doc.mjs

# Run CMD with the dev server up, starting one only if the port is free.
with-server:
	@if curl -sf -o /dev/null http://localhost:$(PORT)/; then $(CMD); \
	else npx vite --port $(PORT) --strictPort >/dev/null 2>&1 & PID=$$!; sleep 2; $(CMD); STATUS=$$?; kill $$PID; exit $$STATUS; fi
