SHELL := /bin/sh

BACKEND_DIR := src/backend
FRONTEND_DIR := src/frontend

.PHONY: setup dev format format-check lint typecheck \
        test test-unit test-contract test-integration test-e2e test-coverage \
        eval eval-regression eval-safety \
        security secret-scan dependency-scan container-scan iac-scan \
        build run smoke-test docs-check readiness-check project-config-check ci test-scripts

# MangaHub is an explicit two-component consumer. Keep commands path-aware;
# do not add a root-level go.mod symlink just to satisfy template detection.
setup:
	@go -C $(BACKEND_DIR) mod download
	@npm ci --prefix $(FRONTEND_DIR)

dev:
	@echo "Run the backend from $(BACKEND_DIR) and the frontend from $(FRONTEND_DIR)."

format:
	@gofmt -w $(BACKEND_DIR)

format-check:
	@test -z "$$(gofmt -l $(BACKEND_DIR))"

lint:
	@go -C $(BACKEND_DIR) vet ./...

typecheck: lint

test: test-unit

test-unit:
	@go -C $(BACKEND_DIR) test -short ./...

test-contract test-integration:
	@go -C $(BACKEND_DIR) test -run Integration ./...

test-e2e:
	@go -C $(BACKEND_DIR) test -run E2E ./...

test-coverage:
	@go -C $(BACKEND_DIR) test -coverprofile=coverage.out -covermode=atomic ./...

eval eval-regression eval-safety:
	@echo "[skip] no provider-backed AI evaluations are configured for MangaHub"

build:
	@mkdir -p bin
	@go -C $(BACKEND_DIR) build -o ../../bin/mangahub .
	@npm run build --prefix $(FRONTEND_DIR)

run:
	@go -C $(BACKEND_DIR) run .

smoke-test:
	@echo "[manual] start MangaHub, then run the consumer smoke-test checklist"

secret-scan:
	@command -v gitleaks >/dev/null 2>&1 && gitleaks detect --source . --no-banner || echo "[skip] gitleaks is provided by CI"

dependency-scan:
	@echo "[skip] dependency review and audit run in GitHub Actions"

container-scan:
	@echo "[skip] no container image is defined"

iac-scan:
	@echo "[skip] no infrastructure-as-code is defined"

security: secret-scan dependency-scan container-scan iac-scan

docs-check:
	@sh scripts/ci-local.sh

readiness-check:
	@sh scripts/validate-production-readiness.sh

project-config-check:
	@sh scripts/validate-project-config.sh

test-scripts:
	@sh scripts/test/test-stack-detection.sh
	@sh scripts/test/test-delivery-workflows.sh
	@sh scripts/test/test-security-workflows.sh
	@sh scripts/test/test-production-readiness.sh
	@sh scripts/test/test-code-review-graph.sh
	@sh scripts/test/test-graphify-integration.sh
	@sh scripts/test/test-branch-protection.sh
	@sh scripts/test/test-prompt-eval-assets.sh
	@sh scripts/test/test-init-project.sh
	@sh scripts/test/test-project-config.sh
	@sh scripts/test/test-openapi-contract.sh

ci: format-check lint docs-check readiness-check project-config-check
	@echo "[ci] MangaHub local gate complete"
