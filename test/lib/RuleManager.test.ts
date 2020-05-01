import {expect} from 'chai';
import {Controller} from '../../src/ioc.config';
import {FilterType, RuleFilter} from '../../src/lib/RuleFilter';
import LocalCatalog from '../../src/lib/services/LocalCatalog';
import fs = require('fs');
import path = require('path');
import Sinon = require('sinon');

const CATALOG_FIXTURE_PATH = path.join('test', 'catalog-fixtures', 'DefaultCatalogFixture.json');
const CATALOG_FIXTURE_RULE_COUNT = 10;
const CATALOG_FIXTURE_DEFAULT_ENABLED_RULE_COUNT = 8;
let ruleManager = null;

describe('RuleManager', () => {
	before(async () => {
		// Make sure all catalogs exist where they're supposed to.
		if (!fs.existsSync(CATALOG_FIXTURE_PATH)) {
			throw new Error('Fake catalog does not exist');
		}

		// Make sure all catalogs have the expected number of rules.
		const catalogJson = JSON.parse(fs.readFileSync(CATALOG_FIXTURE_PATH).toString());
		if (catalogJson.rules.length !== CATALOG_FIXTURE_RULE_COUNT) {
			throw new Error('Fake catalog has ' + catalogJson.rules.length + ' rules instead of ' + CATALOG_FIXTURE_RULE_COUNT);
		}

		// Stub out the LocalCatalog's getCatalog method so it always returns the fake catalog, whose contents are known,
		// and never overwrites the real catalog. (Or we could use the IOC container to do this without sinon.)
		Sinon.stub(LocalCatalog.prototype, 'getCatalog').callsFake(async () => {
			return JSON.parse(fs.readFileSync(CATALOG_FIXTURE_PATH).toString());
		});

		// Declare our rule manager.
		ruleManager = await Controller.createRuleManager();
	});

	describe('getRulesMatchingCriteria()', () => {
		describe('Test Case: No filters provided', () => {
			it('When no filters are provided, all default-enabled rules are returned', async () => {
				// If we pass an empty list into the method, that's treated as the absence of filter criteria.
				const allRules = await ruleManager.getRulesMatchingCriteria([]);

				// Expect all default-enabled rules to have been returned.
				expect(allRules).to.have.lengthOf(CATALOG_FIXTURE_DEFAULT_ENABLED_RULE_COUNT, 'All rules should have been returned');
			});
		});

		describe('Test Case: Filtering by category only', () => {
			it('Filtering by one category returns only rules in that category', async () => {
				// Set up our filter array.
				const filters = [
					new RuleFilter(FilterType.CATEGORY, ['Best Practices']),
					new RuleFilter(FilterType.ENGINE, ['pmd'])];

				// Pass the filter array into the manager.
				const matchingRules = await ruleManager.getRulesMatchingCriteria(filters);

				// Expect the right number of rules to be returned.
				expect(matchingRules).to.have.lengthOf(2, 'Exactly 2 pmd rules are categorized as "Best Practices".');
			});

			it('Filtering by multiple categories returns any rule in either category', async () => {
				// Set up our filter array.
				const filters = [new RuleFilter(FilterType.CATEGORY, ['Best Practices', 'Design'])];

				// Pass the filter array into the manager.
				const matchingRules = await ruleManager.getRulesMatchingCriteria(filters);

				// Expect the right number of rules to be returned.
				expect(matchingRules).to.have.lengthOf(6, 'Exactly 6 rules are categorized as "Best Practices" or "Design"');
			});
		});

		describe('Test Case: Filtering by ruleset only', () => {
			it('Filtering by a single ruleset returns only the rules in that ruleset', async () => {
				// Set up our filter array.
				const filters = [new RuleFilter(FilterType.RULESET, ['Braces'])];

				// Pass the filter array into the manager.
				const matchingRules = await ruleManager.getRulesMatchingCriteria(filters);

				// Expect the right number of rules to be returned.
				expect(matchingRules).to.have.lengthOf(3, 'Exactly 8 rules are in the "Braces" ruleset');
			});

			it('Filtering by multiple rulesets returns any rule in either ruleset', async () => {
				// Set up our filter array.
				const filters = [new RuleFilter(FilterType.RULESET, ['Braces', 'Best Practices'])];

				// Pass the filter array into the manager.
				const matchingRules = await ruleManager.getRulesMatchingCriteria(filters);

				// Expect the right number of rules to be returned.
				expect(matchingRules).to.have.lengthOf(5, 'Exactly 5 rules are in the "Braces" or "Best Practices" rulesets');
			});
		});

		describe('Test Case: Filtering by language', () => {
			it('Filtering by a single language returns only rules targeting that language', async () => {
				// Set up our filter array.
				const filters = [new RuleFilter(FilterType.LANGUAGE, ['apex'])];

				// Pass the filter array into the manager.
				const matchingRules = await ruleManager.getRulesMatchingCriteria(filters);

				// Expect the right number of rules to be returned.
				expect(matchingRules).to.have.lengthOf(2, 'There are 2 rules that target Apex');
			});

			it('Filtering by multiple languages returns any rule targeting either language', async () => {
				// Set up our filter array.
				const filters = [new RuleFilter(FilterType.LANGUAGE, ['apex', 'javascript'])];

				// Pass the filter array into the manager.
				const matchingRules = await ruleManager.getRulesMatchingCriteria(filters);

				// Expect the right number of rules to be returned.
				expect(matchingRules).to.have.lengthOf(10, 'There are 10 rules targeting either Apex or JS');
			});
		});

		describe('Test Case: Mixing filter types', () => {
			it('Filtering on multiple columns at once returns only rules that satisfy ALL filters', async () => {
				// Set up our filter array.
				const filters = [
					new RuleFilter(FilterType.LANGUAGE, ['javascript']),
					new RuleFilter(FilterType.CATEGORY, ['Best Practices'])
				];

				// Pass the filter array into the manager.
				const matchingRules = await ruleManager.getRulesMatchingCriteria(filters);

				// Expect the right number of rules to be returned.
				expect(matchingRules).to.have.lengthOf(4, 'Exactly 4 rules target Apex and are categorized as "Best Practices".');
			});
		});

		describe('Edge Case: No rules match criteria', () => {
			it('When no rules match the given criteria, an empty list is returned', async () => {
				// Define our preposterous filter array.
				const impossibleFilters = [new RuleFilter(FilterType.CATEGORY, ['beebleborp'])];

				// Pass our filters into the manager.
				const matchingRules = await ruleManager.getRulesMatchingCriteria(impossibleFilters);

				// There shouldn't be anything in the array.
				expect(matchingRules).to.have.lengthOf(0, 'Should be no matching rules');
			});
		});
	});
});
