import Lab from '@hapi/lab';
import Sinon from 'sinon';
import * as R from 'ramda';
import Code from 'code';
import { factory } from 'typeorm-seeding';
import * as Config from '../../../../src/config/config';
import { lab } from '../../../setup';
import { User } from '../../../../src/model/user';
import { Group } from '../../../../src/model/group';
import * as Resource from '../../../../src/app/user/group/resource';
import CasbinSingleton from '../../../../src/lib/casbin';

exports.lab = Lab.script();
const Sandbox = Sinon.createSandbox();

const removeTimestamps = R.map(R.omit(['updatedAt', 'createdAt']));
const sortById = R.sortBy(R.prop('id'));
const getParsedResults = R.pipe(removeTimestamps, sortById);

lab.afterEach(() => {
  Sandbox.restore();
});

lab.experiment('UserGroup::resource', () => {
  lab.experiment('get groups of a user', () => {
    let users: any, groups: any, enforcer: any;

    lab.before(async () => {
      const dbUri = Config.get('/postgres').uri;
      enforcer = await CasbinSingleton.create(dbUri);
    });

    lab.beforeEach(async () => {
      users = await factory(User)().createMany(2);
      groups = await factory(Group)().createMany(3);
      const user = users[0];
      await enforcer.addResourceGroupingJsonPolicy(
        { group: groups[0].id },
        { entity: 'gojek' },
        { created_by: user }
      );
      await enforcer.addResourceGroupingJsonPolicy(
        { group: groups[1].id },
        { entity: 'gojek' },
        { created_by: user }
      );
      await enforcer.addResourceGroupingJsonPolicy(
        { group: groups[2].id },
        { entity: 'gofin' },
        { created_by: user }
      );

      await enforcer.addSubjectGroupingJsonPolicy(
        { user: users[0].id },
        { group: groups[0].id },
        { created_by: user }
      );
      await enforcer.addSubjectGroupingJsonPolicy(
        { user: users[0].id },
        { group: groups[1].id },
        { created_by: user }
      );
      await enforcer.addSubjectGroupingJsonPolicy(
        { user: users[1].id },
        { group: groups[0].id },
        { created_by: user }
      );

      await enforcer.addActionGroupingJsonPolicy(
        { action: '*' },
        { role: 'entity.admin' },
        { created_by: user }
      );

      await enforcer.addJsonPolicy(
        { user: users[1].id },
        { entity: 'gofin' },
        { role: 'entity.admin' },
        { created_by: user }
      );
      await enforcer.addJsonPolicy(
        { user: users[0].id },
        { group: groups[0].id },
        { role: 'team.admin' },
        { created_by: user }
      );
      await enforcer.addJsonPolicy(
        { user: users[1].id },
        { group: groups[0].id },
        { role: 'team.admin' },
        { created_by: user }
      );
    });

    lab.test('should get all explicit groups of a user', async () => {
      const result = await Resource.list(users[0].id, {});
      const expectedResult = [
        {
          ...groups[0],
          attributes: [{ entity: 'gojek' }],
          policies: [
            {
              subject: { user: users[0].id },
              resource: { group: groups[0].id },
              action: { role: 'team.admin' }
            }
          ]
        },
        { ...groups[1], attributes: [{ entity: 'gojek' }], policies: [] }
      ];

      const parsedResult = getParsedResults(result);
      const parsedExpectedResult = getParsedResults(expectedResult);
      Code.expect(parsedResult).to.equal(parsedExpectedResult);
    });

    lab.test(
      'should get all explicit groups with policies of a user based on attribute filters',
      async () => {
        const result = await Resource.list(users[1].id, {
          entity: 'gojek'
        });

        const expectedResult = [
          {
            ...groups[0],
            attributes: [{ entity: 'gojek' }],
            policies: [
              {
                subject: { user: users[1].id },
                resource: { group: groups[0].id },
                action: { role: 'team.admin' }
              }
            ]
          }
        ];

        const parsedResult = getParsedResults(result);
        const parsedExpectedResult = getParsedResults(expectedResult);
        Code.expect(parsedResult).to.equal(parsedExpectedResult);
      }
    );

    lab.test(
      'should get all implicit groups of a user based on the specified action and filter',
      async () => {
        const result = await Resource.list(users[1].id, {
          entity: 'gofin',
          landscape: 'id',
          environment: 'integration',
          action: 'firehose.read'
        });
        const expectedResult = [
          { ...groups[2], attributes: [{ entity: 'gofin' }], policies: [] }
        ];

        const parsedResult = getParsedResults(result);
        const parsedExpectedResult = getParsedResults(expectedResult);
        Code.expect(parsedResult).to.equal(parsedExpectedResult);
      }
    );
  });
});
