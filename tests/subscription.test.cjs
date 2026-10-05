const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function fixture(succeeded) {
    const events = [], writes = [];
    const database = { collection(collection) { return { doc(id) { return {
        async delete() { events.push('delete'); },
        async set(value) { writes.push({ collection, id, value }); },
    }; } }; } };
    const modules = {
        axios: { async get() { events.push('lookup'); return { data: {
            succeeded, resultList: succeeded ? [{ vaccinationCenterPk: 'fixture-center', name: 'Fixture',
                zipcode: '12345', vaccineName: 'BioNtech', vaccineType: 'fixture', outOfStock: false, freeSlotSizeOnline: 1 }] : [],
        } }; } },
        'firebase-admin': { initializeApp() {}, credential: { cert() { return {}; } }, firestore() { return database; },
            messaging() { throw Error('Notifications must not run in these fixtures'); } },
    };
    const cache = new Map();
    function load(file) {
        if (cache.has(file)) return cache.get(file);
        const exports = {}; cache.set(file, exports);
        const source = fs.readFileSync(file, 'utf8');
        const result = ts.transpileModule(source, { compilerOptions: {
            target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
        } });
        const context = vm.createContext({ exports, console: { log() {} },
            setInterval() { throw Error('Polling must not run in these fixtures'); },
            require(id) {
                if (Object.hasOwn(modules, id)) return modules[id];
                if (id === './firebase-service-account.json') return {}; // Never read credential files.
                assert.ok(id.startsWith('./'), `Unexpected import ${id}`);
                return load(path.resolve(path.dirname(file), id + '.ts'));
            },
        });
        vm.runInContext(result.outputText, context); return exports;
    }
    const Bot = load(path.join(__dirname, '../src/ImpfBot.ts')).default;
    const bot = new Bot();
    const original = { fcmToken: 'fixture-token', zip: 'old-zip' };
    bot.users.push(original);
    return { bot, original, events, writes,
        replace: () => bot.addSubscription('fixture-token', '12345', false, 1, false, true, false, false, false),
    };
}

test('unsuccessful replacement lookup preserves the existing subscription', async () => {
    const f = fixture(false);
    assert.equal(await f.replace(), false);
    assert.equal(f.bot.users.length, 1);
    assert.equal(f.bot.users[0], f.original);
    assert.deepEqual(f.events, ['lookup']);
    assert.equal(f.writes.length, 0);
});

test('successful replacement validates first and retains exactly one updated subscription', async () => {
    const f = fixture(true);
    assert.equal(await f.replace(), true);
    assert.deepEqual(f.events, ['lookup', 'delete']);
    assert.equal(f.bot.users.length, 1);
    assert.equal(f.bot.users[0].zip, '12345');
    assert.equal(f.writes.filter(write => write.collection === 'subscriptions').length, 1);
});
