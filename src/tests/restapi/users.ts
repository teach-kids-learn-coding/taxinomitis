/*eslint-env mocha */
import * as util from 'util';
import * as uuid from 'uuid/v1';
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as proxyquire from 'proxyquire';
import * as request from 'supertest-as-promised';
import * as httpstatus from 'http-status';
import * as randomstring from 'randomstring';

import * as store from '../../lib/db/store';
import * as auth from '../../lib/restapi/auth';
import * as auth0 from '../../lib/auth0/requests';
import * as mocks from '../auth0/requestmocks';

import testapiserver from './testserver';

let testServer;


describe('REST API - users', () => {

    const TENANTS = {
        correct : 'single',
        incorrect : 'different',
    };


    let authStub;
    let checkUserStub;
    let requireSupervisorStub;

    function authNoOp(req, res, next) { next(); }


    before(() => {
        authStub = sinon.stub(auth, 'authenticate').callsFake(authNoOp);
        checkUserStub = sinon.stub(auth, 'checkValidUser').callsFake(authNoOp);
        requireSupervisorStub = sinon.stub(auth, 'requireSupervisor').callsFake(authNoOp);
        proxyquire('../../lib/restapi/users', {
            './auth' : {
                authenticate : authStub,
                checkValidUser : checkUserStub,
                requireSupervisor : requireSupervisorStub,
            },
        });

        testServer = testapiserver();
    });

    after(() => {
        authStub.restore();
        checkUserStub.restore();
        requireSupervisorStub.restore();
    });


    describe('deleteStudent()', () => {

        it('should delete a student', () => {
            const stubs = {
                getOauthToken : sinon.stub(auth0, 'getOauthToken').callsFake(mocks.getOauthToken.good),
                getUser : sinon.stub(auth0, 'getUser').callsFake(mocks.getUser.johndoe),
                deleteUser : sinon.stub(auth0, 'deleteUser').callsFake(mocks.deleteUser.good),
            };

            proxyquire('../../lib/auth0/users', {
                './requests' : stubs,
            });

            return store.init()
                .then(() => {
                    return request(testServer)
                        .del('/api/classes/' + TENANTS.correct + '/students/auth0|58dd72d0b2e87002695249b6')
                        .expect(httpstatus.NO_CONTENT);
                })
                .then(() => {
                    stubs.getOauthToken.restore();
                    stubs.getUser.restore();
                    stubs.deleteUser.restore();

                    return store.disconnect();
                });
        });

        it('should refuse to delete students from a different tenant', () => {
            const stubs = {
                getOauthToken : sinon.stub(auth0, 'getOauthToken').callsFake(mocks.getOauthToken.good),
                getUser : sinon.stub(auth0, 'getUser').callsFake(mocks.getUser.johndoe),
                deleteUser : sinon.stub(auth0, 'deleteUser').callsFake(mocks.deleteUser.good),
            };

            proxyquire('../../lib/auth0/users', {
                './requests' : stubs,
            });

            return request(testServer)
                .del('/api/classes/' + TENANTS.incorrect + '/students/auth0|58dd72d0b2e87002695249b6')
                .expect('Content-Type', /json/)
                .expect(httpstatus.NOT_FOUND)
                .then((res) => {
                    const body = res.body;
                    assert.equal(body.statusCode, 404);
                    assert.equal(body.error, 'Not Found');
                })
                .then(function restore() {
                    stubs.getOauthToken.restore();
                    stubs.getUser.restore();
                    stubs.deleteUser.restore();
                });
        });

    });


    describe('createStudent()', () => {

        it('should create a new user', () => {
            const stubs = {
                getOauthToken : sinon.stub(auth0, 'getOauthToken').callsFake(mocks.getOauthToken.good),
                createUser : sinon.stub(auth0, 'createUser').callsFake(mocks.createUser.good),
                getUserCounts : sinon.stub(auth0, 'getUserCounts').callsFake(mocks.getUserCounts),
            };

            proxyquire('../../lib/auth0/users', {
                './requests' : stubs,
            });

            const username = randomstring.generate({ length : 12, readable : true });

            return store.init()
                .then(() => {
                    return request(testServer)
                        .post('/api/classes/mytesttenant/students')
                        .send({ username })
                        .expect('Content-Type', /json/)
                        .expect(httpstatus.CREATED);
                })
                .then((res) => {
                    const body = res.body;
                    assert(body.id);
                    assert(body.password);
                    assert.equal(body.username, username);

                    stubs.getOauthToken.restore();
                    stubs.createUser.restore();
                    stubs.getUserCounts.restore();

                    return store.disconnect();
                });
        });


        it('should require a username', () => {
            const stubs = {
                getOauthToken : sinon.stub(auth0, 'getOauthToken').callsFake(mocks.getOauthToken.good),
                createUser : sinon.stub(auth0, 'createUser').callsFake(mocks.createUser.good),
            };

            proxyquire('../../lib/auth0/users', {
                './requests' : stubs,
            });

            return request(testServer)
                .post('/api/classes/mytesttenant/students')
                .expect('Content-Type', /json/)
                .expect(httpstatus.BAD_REQUEST)
                .then((res) => {
                    const body = res.body;
                    assert.equal(body.error, 'Missing required field "username"');
                })
                .then(function restore() {
                    stubs.getOauthToken.restore();
                    stubs.createUser.restore();
                });
        });


        it('should require a valid username', () => {
            const stubs = {
                getOauthToken : sinon.stub(auth0, 'getOauthToken').callsFake(mocks.getOauthToken.good),
                createUser : sinon.stub(auth0, 'createUser').callsFake(mocks.createUser.good),
            };

            proxyquire('../../lib/auth0/users', {
                './requests' : stubs,
            });

            return request(testServer)
                .post('/api/classes/mytesttenant/students')
                .send({ username : 'Hello World' })
                .expect('Content-Type', /json/)
                .expect(httpstatus.BAD_REQUEST)
                .then((res) => {
                    const body = res.body;
                    assert.equal(body.error, 'Invalid username. Use letters, numbers, hyphens and underscores, only.');
                })
                .then(function restore() {
                    stubs.getOauthToken.restore();
                    stubs.createUser.restore();
                });
        });


        it('should enforce limits on number of users in a class', () => {
            const stubs = {
                getOauthToken : sinon.stub(auth0, 'getOauthToken').callsFake(mocks.getOauthToken.good),
                createUser : sinon.stub(auth0, 'createUser').callsFake(mocks.createUser.good),
                getUserCounts : sinon.stub(auth0, 'getUserCounts').resolves({ total : 8 }),
            };

            proxyquire('../../lib/auth0/users', {
                './requests' : stubs,
            });

            return store.init()
                .then(() => {
                    return request(testServer)
                        .post('/api/classes/mytesttenant/students')
                        .send({ username : 'HelloWorld' })
                        .expect('Content-Type', /json/)
                        .expect(httpstatus.CONFLICT);
                })
                .then((res) => {
                    const body = res.body;
                    assert.equal(body.error, 'Class already has maximum allowed number of students');

                    stubs.getOauthToken.restore();
                    stubs.createUser.restore();
                    stubs.getUserCounts.restore();

                    return store.disconnect();
                });
        });
    });


    describe('getStudents()', () => {

        it('should cope with an empty list', () => {
            const stubs = {
                getOauthToken : sinon.stub(auth0, 'getOauthToken').callsFake(mocks.getOauthToken.good),
                getUsers : sinon.stub(auth0, 'getUsers').callsFake(mocks.getUsers.empty),
            };

            proxyquire('../../lib/auth0/users', {
                './requests' : stubs,
            });

            return request(testServer)
                .get('/api/classes/empty/students')
                .expect('Content-Type', /json/)
                .expect(httpstatus.OK)
                .then((res) => {
                    const body = res.body;
                    assert.equal(body.length, 0);
                    assert(util.isArray(body));
                })
                .then(function restore() {
                    stubs.getOauthToken.restore();
                    stubs.getUsers.restore();
                });
        });

        it('should cope with a class with one student', () => {
            const stubs = {
                getOauthToken : sinon.stub(auth0, 'getOauthToken').callsFake(mocks.getOauthToken.good),
                getUsers : sinon.stub(auth0, 'getUsers').callsFake(mocks.getUsers.single),
            };

            proxyquire('../../lib/auth0/users', {
                './requests' : stubs,
            });

            return request(testServer)
                .get('/api/classes/single/students')
                .expect('Content-Type', /json/)
                .expect(httpstatus.OK)
                .then((res) => {
                    const body = res.body;
                    assert.equal(body.length, 1);
                    assert(util.isArray(body));
                })
                .then(function restore() {
                    stubs.getOauthToken.restore();
                    stubs.getUsers.restore();
                });
        });

        it('should cope with errors', () => {
            const stubs = {
                getOauthToken : sinon.stub(auth0, 'getOauthToken').callsFake(mocks.getOauthToken.good),
                getUsers : sinon.stub(auth0, 'getUsers').callsFake(mocks.getUsers.error),
            };

            proxyquire('../../lib/auth0/users', {
                './requests' : stubs,
            });

            return request(testServer)
                .get('/api/classes/single/students')
                .expect('Content-Type', /json/)
                .expect(httpstatus.INTERNAL_SERVER_ERROR)
                .then((res) => {
                    const body = res.body;
                    assert(body.error);
                })
                .then(function restore() {
                    stubs.getOauthToken.restore();
                    stubs.getUsers.restore();
                });
        });
    });

    describe('resetPassword()', () => {

        it('should reset passwords for a user', () => {
            const stubs = {
                getOauthToken : sinon.stub(auth0, 'getOauthToken').callsFake(mocks.getOauthToken.good),
                getUser : sinon.stub(auth0, 'getUser').callsFake(mocks.getUser.johndoe),
                modifyUser : sinon.stub(auth0, 'modifyUser').callsFake(mocks.modifyUser.good),
            };

            proxyquire('../../lib/auth0/users', {
                './requests' : stubs,
            });

            const userid = 'auth0|58dd72d0b2e87002695249b6';

            return request(testServer)
                .post('/api/classes/' + TENANTS.correct + '/students/' + userid + '/password')
                .expect('Content-Type', /json/)
                .expect(httpstatus.OK)
                .then((res) => {
                    const body = res.body;
                    assert.equal(body.id, userid);
                    assert(body.username);
                    assert(body.password);
                })
                .then(function restore() {
                    stubs.getOauthToken.restore();
                    stubs.getUser.restore();
                    stubs.modifyUser.restore();
                });
        });

        it('should refuse to reset passwords for students in a different tenant', () => {
            const stubs = {
                getOauthToken : sinon.stub(auth0, 'getOauthToken').callsFake(mocks.getOauthToken.good),
                getUser : sinon.stub(auth0, 'getUser').callsFake(mocks.getUser.johndoe),
                modifyUser : sinon.stub(auth0, 'modifyUser').callsFake(mocks.modifyUser.good),
            };

            proxyquire('../../lib/auth0/users', {
                './requests' : stubs,
            });

            return request(testServer)
                .post('/api/classes/' + TENANTS.incorrect + '/students/auth0|58dd72d0b2e87002695249b6/password')
                .expect('Content-Type', /json/)
                .expect(httpstatus.NOT_FOUND)
                .then((res) => {
                    const body = res.body;
                    assert.equal(body.statusCode, 404);
                    assert.equal(body.error, 'Not Found');
                })
                .then(function restore() {
                    stubs.getOauthToken.restore();
                    stubs.getUser.restore();
                    stubs.modifyUser.restore();
                });
        });

    });

});
