# Must set ENV CHANGELOG_GITHUB_TOKEN to the Github token

docker run -it --rm -v "$(pwd)":/usr/local/src/your-app githubchangeloggenerator/github-changelog-generator \
  --user chainsafe \
  --project lodestar \
  --issues false \
  --pull-requests true \
  --pr-wo-labels true \
  --usernames-as-github-logins true \
  --compare-link true \
  --filter-by-milestone false \
  --unreleased false \
  --exclude-labels meta-excludefromchangelog \
  --since-tag v0.32.0 \
  --output ./CHANGELOG.md
