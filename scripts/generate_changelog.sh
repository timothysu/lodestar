# Must set ENV CHANGELOG_GITHUB_TOKEN to the Github token

CHANGELOG_OUTPUT_PATH=./CHANGELOG.md

docker run --rm \
  # Must be run in lodestar's directory
  -v "$(pwd)":/usr/local/src/your-app \
  # Forward the value of the ENV CHANGELOG_GITHUB_TOKEN without displaying it
  -e CHANGELOG_GITHUB_TOKEN \
  githubchangeloggenerator/github-changelog-generator \
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
  # TODO: Set as argument
  --since-tag v0.32.0 \
  --output $CHANGELOG_OUTPUT_PATH

# Strip generator notice.
echo "Stripping generator notice."
sed -i '/This Changelog was automatically generated/d' "$CHANGELOG_OUTPUT_PATH"
