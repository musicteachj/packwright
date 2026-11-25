import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { ENV_NAMES } from '../apps/api/src/env'

/**
 * The deploy files, read as files, and `deploy.sh` run for real against a fake `aws` and a fake
 * `curl` (`fixtures/bin`), which record every call and answer with canned JSON. Nothing here
 * reaches the network, Docker or AWS.
 *
 * Packwright has no setup task and no scheduled job, so the paths that only those take run
 * against `fixtures/ecs`: a made-up app, `example`, that has both.
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const ECS_DIR = join(here, 'ecs')
const FIXTURE_DIR = join(here, 'fixtures', 'ecs')
const FAKE_BIN = join(here, 'fixtures', 'bin')

const ACCOUNT = '123456789012'
const IMAGE = `${ACCOUNT}.dkr.ecr.us-east-1.amazonaws.com/portfolio/packwright:0123abc`
const TARGET_GROUP_ARN = `arn:aws:elasticloadbalancing:us-east-1:${ACCOUNT}:targetgroup/packwright/abc`
const ALB_DNS_NAME = 'portfolio-alb.example'
const HOST = 'packwright.jameslittlefield.net'
const ARN_PREFIX = `arn:aws:ecs:us-east-1:${ACCOUNT}`
// What the fake answers register-task-definition with, for the family it was given.
const revisionArn = (family: string) =>
  `arn:aws:ecs:us-east-1:${ACCOUNT}:task-definition/${family}:7`

interface NameValue {
  name: string
  value: string
}
interface Secret {
  name: string
  valueFrom: string
}
interface Container {
  name: string
  image?: string
  user?: string
  privileged?: boolean
  readonlyRootFilesystem?: boolean
  environment?: NameValue[]
  secrets?: Secret[]
  dockerSecurityOptions?: string[]
  linuxParameters?: {
    capabilities?: { drop?: string[] }
    tmpfs?: { containerPath: string; size: number }[]
  }
}
interface TaskDefinition {
  family: string
  executionRoleArn?: string
  containerDefinitions: Container[]
}
interface Service {
  taskDefinition?: string
  healthCheckGracePeriodSeconds: number
  deploymentConfiguration: Record<string, unknown>
  loadBalancers: { targetGroupArn: string }[]
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

/** Every task definition Packwright deploys: each file in `deploy/ecs` but the service. */
function taskDefinitions(): TaskDefinition[] {
  const files = readdirSync(ECS_DIR).filter((f) => f.endsWith('.json') && f !== 'service.json')
  expect(files).toContain('web.json')
  return files.map((file) => readJson<TaskDefinition>(join(ECS_DIR, file)))
}
const containers = () => taskDefinitions().flatMap((definition) => definition.containerDefinitions)

/** A script with its comment lines taken out, so a comment that names a flag is not the flag. */
const codeOf = (file: string) =>
  readFileSync(join(here, file), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')

interface Run {
  status: number | null
  output: string
  /** One line per command the fakes saw, `aws ...` or `curl ...`, in order. */
  calls: string[]
  /** Where the fake `aws` copied each `--cli-input-json` file, by its name. */
  inputs: string
}

const workDirs: string[] = []
afterEach(() => {
  for (const dir of workDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function run(command: string[], ecsDir: string, fake: Record<string, string> = {}): Run {
  const work = mkdtempSync(join(tmpdir(), 'packwright-deploy-'))
  workDirs.push(work)
  const calls = join(work, 'calls.log')
  const inputs = join(work, 'inputs')
  writeFileSync(calls, '')
  mkdirSync(inputs)
  const result = spawnSync('bash', command, {
    encoding: 'utf8',
    // Built from nothing rather than from process.env, so no AWS profile or key on this machine
    // would be in reach even if the fake were somehow not first on PATH.
    env: {
      PATH: `${FAKE_BIN}:${process.env.PATH ?? ''}`,
      HOME: work,
      AWS_CONFIG_FILE: '/dev/null',
      AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_ACCOUNT_ID: ACCOUNT,
      AWS_REGION: 'us-east-1',
      ALB_DNS_NAME,
      TARGET_GROUP_ARN,
      DEPLOY_ECS_DIR: ecsDir,
      // Short deadlines, so a failing check ends the run in a second, not in minutes.
      SMOKE_DELAY_SECONDS: '1',
      SMOKE_FIRST_SECONDS: '1',
      SMOKE_SECONDS: '1',
      FAKE_CALLS: calls,
      FAKE_INPUTS: inputs,
      ...fake,
    },
  })
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    calls: readFileSync(calls, 'utf8').split('\n').filter(Boolean),
    inputs,
  }
}

const deploy = (ecsDir: string, fake: Record<string, string> = {}) =>
  run([join(here, 'deploy.sh'), IMAGE], ecsDir, fake)

const serviceCalls = (calls: string[]) =>
  calls.filter((call) => /^aws ecs (create|update)-service/.test(call))

describe('the task definitions', () => {
  it('names no NODE_ENV', () => {
    for (const container of containers()) {
      expect((container.environment ?? []).map((entry) => entry.name)).not.toContain('NODE_ENV')
    }
  })

  it('trusts exactly one proxy hop', () => {
    const web = readJson<TaskDefinition>(join(ECS_DIR, 'web.json')).containerDefinitions[0]
    const hops = web?.environment?.find((entry) => entry.name === 'TRUST_PROXY_HOPS')
    expect(hops?.value).toBe('1')
  })

  it('keeps every secret in SSM', () => {
    // Addresses, not credentials, though their names say URL.
    const notSecrets = ['APP_ORIGIN', 'CLIENT_URL', 'CORS_ORIGINS']
    for (const container of containers()) {
      for (const { name } of container.environment ?? []) {
        if (!notSecrets.includes(name))
          expect(name).not.toMatch(/KEY|SECRET|PASSWORD|TOKEN|URI|URL/)
      }
      for (const secret of container.secrets ?? []) {
        expect(secret.valueFrom).toBe(
          `arn:aws:ssm:__REGION__:__ACCOUNT_ID__:parameter/portfolio/packwright/${secret.name}`,
        )
      }
    }
  })

  it('names only variables the server reads', () => {
    const web = readJson<TaskDefinition>(join(ECS_DIR, 'web.json')).containerDefinitions[0]
    const names = [...(web?.environment ?? []), ...(web?.secrets ?? [])].map((entry) => entry.name)
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) expect(ENV_NAMES).toContain(name)
  })

  it('is hardened', () => {
    for (const container of containers()) {
      expect(container.readonlyRootFilesystem).toBe(true)
      expect(container.linuxParameters?.tmpfs?.map((mount) => mount.containerPath)).toContain(
        '/tmp',
      )
      expect(container.linuxParameters?.capabilities?.drop).toEqual(['ALL'])
      expect(container.dockerSecurityOptions).toContain('no-new-privileges')
      expect(container.privileged ?? false).toBe(false)
      if (container.user !== undefined) expect(container.user).not.toMatch(/^(root|0)(:|$)/)
    }
  })

  it('tags nothing', () => {
    // The deploy role has no ecs:TagResource, so a tag on any of these would be refused.
    for (const dir of [ECS_DIR, FIXTURE_DIR]) {
      const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
      expect(files).toContain('service.json')
      for (const file of files) {
        const json = readJson<Record<string, unknown>>(join(dir, file))
        for (const key of ['tags', 'propagateTags', 'enableECSManagedTags']) {
          expect(json, `${file} names ${key}`).not.toHaveProperty(key)
        }
      }
    }
  })
})

describe('deploy.sh', () => {
  it('never traces the script', () => {
    for (const script of ['deploy.sh', 'smoke.sh', 'head-of-main.sh']) {
      const code = codeOf(script)
      expect(code).toContain('set -euo pipefail')
      expect(code).not.toMatch(/set -[a-z]*x/)
      expect(code).not.toMatch(/set -o xtrace/)
      expect(code).not.toContain('envsubst')
    }
  })

  it('registers web.json with every placeholder filled', () => {
    const result = deploy(ECS_DIR)
    expect(result.status).toBe(0)
    const registered = readFileSync(join(result.inputs, 'web.json'), 'utf8')
    expect(registered).not.toMatch(/__[A-Z][A-Z_]*__/)
    const web = JSON.parse(registered) as TaskDefinition
    expect(web.containerDefinitions[0]?.image).toBe(IMAGE)
    expect(web.executionRoleArn).toBe(`arn:aws:iam::${ACCOUNT}:role/packwright-execution`)
  })

  it('stops before the service when setup fails', () => {
    const result = deploy(FIXTURE_DIR, { FAKE_SETUP: 'failed' })
    expect(result.status).toBe(1)
    expect(serviceCalls(result.calls)).toEqual([])
    expect(result.calls).toContainEqual(
      `aws ecs run-task --cluster portfolio --launch-type EC2 --task-definition ${revisionArn('example-setup')} --output json`,
    )
    // The log is read by the stream name ECS gives it: <prefix>/<container>/<task id>.
    expect(result.calls).toContainEqual(
      'aws logs get-log-events --log-group-name /portfolio/example --log-stream-name setup/example-setup/setuptask1 --limit 50 --output json',
    )
    expect(result.output).toContain('migration 7 failed')
    expect(result.calls.some((call) => call.startsWith('aws ssm'))).toBe(false)
  })

  it.each([
    ['stops a container without an exit code', 'no-exit-code'],
    ['is never placed', 'unplaced'],
  ])('stops before the service when the setup task %s', (_, setup) => {
    const result = deploy(FIXTURE_DIR, { FAKE_SETUP: setup })
    expect(result.status).toBe(1)
    expect(serviceCalls(result.calls)).toEqual([])
  })

  it.each([
    ['scaled to 0', 'zero'],
    ['draining', 'draining'],
  ])('runs no setup for a service that is %s', (_, service) => {
    const result = deploy(FIXTURE_DIR, { FAKE_SERVICE: service })
    expect(result.status).toBe(1)
    expect(result.calls.some((call) => call.startsWith('aws ecs run-task'))).toBe(false)
    expect(serviceCalls(result.calls)).toEqual([])
  })

  it('names the setup task when it does not stop in time, and touches no service', () => {
    const result = deploy(FIXTURE_DIR, { FAKE_SETUP: 'timeout' })
    expect(result.status).toBe(1)
    expect(result.output).toContain(`${ARN_PREFIX}:task/portfolio/setuptask1`)
    expect(result.output).toContain('may still be running')
    expect(result.output).toContain('do not re-run')
    expect(result.output).toContain('aws ecs describe-tasks --cluster portfolio --tasks')
    expect(serviceCalls(result.calls)).toEqual([])
    expect(result.calls.some((call) => call.startsWith('aws ecs stop-task'))).toBe(false)
  })

  it.each([
    ['exit code 0', 'timeout-stopped', true],
    ['a non-zero exit code', 'timeout-stopped-failed', false],
    ['still STOPPING with every container exited 0', 'timeout-stopping', true],
  ])(
    'judges a setup that stopped just after the waiter gave up by its exit code (%s)',
    (_, setup, succeeds) => {
      const result = deploy(FIXTURE_DIR, { FAKE_SETUP: setup })
      expect(result.status === 0).toBe(succeeds)
      expect(serviceCalls(result.calls)).toHaveLength(succeeds ? 1 : 0)
      if (!succeeds) expect(result.output).toContain('the setup task failed')
    },
  )

  it.each(['UserInitiated', 'ServiceSchedulerInitiated', 'SpotInterruption'])(
    'does not pass a setup that exited 0 but was stopped by ECS (stop code %s)',
    (stopCode) => {
      // A migration that trapped SIGTERM and exited 0 half done must not pass as a finished setup.
      const result = deploy(FIXTURE_DIR, { FAKE_STOP_CODE: stopCode })
      expect(result.status).toBe(1)
      expect(result.output).toContain(`stop code ${stopCode}`)
      expect(result.output).toContain('was stopped by ECS')
      expect(serviceCalls(result.calls)).toEqual([])
      expect(result.calls.some((call) => call.startsWith('aws ssm'))).toBe(false)
    },
  )

  it('does not trust a setup with exit code 0 and no stop code', () => {
    const result = deploy(FIXTURE_DIR, { FAKE_STOP_CODE: 'absent' })
    expect(result.status).toBe(1)
    expect(result.output).toContain('exited 0, but ECS reported no stop code')
    expect(result.output).not.toContain('was stopped by ECS')
    expect(serviceCalls(result.calls)).toEqual([])
  })

  it('names the stop code only when every container exited 0', () => {
    // A failed container stopped by ECS is a plain failure: the exit code is the news.
    const result = deploy(FIXTURE_DIR, { FAKE_SETUP: 'failed', FAKE_STOP_CODE: 'UserInitiated' })
    expect(result.status).toBe(1)
    expect(result.output).toContain('the setup task failed, so the service was not touched')
    expect(result.output).not.toContain('was stopped by ECS')
    expect(serviceCalls(result.calls)).toEqual([])
  })

  it('says what to check when the setup task failed to start', () => {
    const result = deploy(FIXTURE_DIR, {
      FAKE_SETUP: 'no-exit-code',
      FAKE_STOP_CODE: 'TaskFailedToStart',
    })
    expect(result.status).toBe(1)
    expect(result.output).toContain('failed to start (stop code TaskFailedToStart)')
    expect(result.output).toContain('image pull')
    expect(result.output).toContain('free memory')
    expect(serviceCalls(result.calls)).toEqual([])
  })

  it('does not settle a stopping task that has no stop code yet', () => {
    const result = deploy(FIXTURE_DIR, { FAKE_SETUP: 'timeout-stopping-no-stop-code' })
    expect(result.status).toBe(1)
    expect(result.output).toContain('may still be running')
    expect(serviceCalls(result.calls)).toEqual([])
  })

  it('passes a setup whose essential container exited by itself', () => {
    const result = deploy(FIXTURE_DIR, { FAKE_STOP_CODE: 'EssentialContainerExited' })
    expect(result.status).toBe(0)
    expect(serviceCalls(result.calls)).toHaveLength(1)
  })

  it('creates the service the first time and updates it after', () => {
    const webArn = revisionArn('packwright-web')

    const first = deploy(ECS_DIR)
    expect(first.status).toBe(0)
    expect(serviceCalls(first.calls)).toEqual([
      expect.stringMatching(/^aws ecs create-service --cli-input-json file:\/\//),
    ])
    // The full revision ARN: the deploy role's condition refuses a bare family.
    const created = readJson<Service>(join(first.inputs, 'create-service.json'))
    expect(created.taskDefinition).toBe(webArn)
    expect(created.loadBalancers[0]?.targetGroupArn).toBe(TARGET_GROUP_ARN)

    const second = deploy(ECS_DIR, { FAKE_SERVICE: 'active' })
    expect(second.status).toBe(0)
    expect(serviceCalls(second.calls)).toEqual([
      expect.stringMatching(
        /^aws ecs update-service --cluster portfolio --service packwright --task-definition /,
      ),
    ])
    expect(serviceCalls(second.calls)[0]).toContain(`--task-definition ${webArn} `)
  })

  it('carries the deployment settings into an update, and never the desired count', () => {
    const service = readJson<Service>(join(ECS_DIR, 'service.json'))
    const result = deploy(ECS_DIR, { FAKE_SERVICE: 'active' })
    expect(result.status).toBe(0)
    const [update] = serviceCalls(result.calls)
    // jq -c and JSON.stringify both write compact JSON in the file's key order.
    expect(update).toContain(
      `--deployment-configuration ${JSON.stringify(service.deploymentConfiguration)} `,
    )
    expect(update).toContain(
      `--health-check-grace-period-seconds ${service.healthCheckGracePeriodSeconds} `,
    )
    expect(update).not.toContain('--desired-count')
    // The target group comes from service.json, so a replaced group takes effect on the next deploy.
    expect(update).toContain(
      `--load-balancers ${JSON.stringify(
        service.loadBalancers.map((balancer) => ({
          ...balancer,
          targetGroupArn: TARGET_GROUP_ARN,
        })),
      )}`,
    )
  })

  it('refuses a service that is still draining', () => {
    const result = deploy(ECS_DIR, { FAKE_SERVICE: 'draining' })
    expect(result.status).toBe(1)
    expect(serviceCalls(result.calls)).toEqual([])
    expect(result.output).toContain(
      'service is still draining; wait until it is INACTIVE and re-run',
    )
  })

  it('refuses a service that was scaled to 0 on purpose', () => {
    const result = deploy(ECS_DIR, { FAKE_SERVICE: 'zero' })
    expect(result.status).toBe(1)
    expect(serviceCalls(result.calls)).toEqual([])
    expect(result.output).toContain('scaled to 0 on purpose')
    expect(result.output).toContain(
      'aws ecs update-service --cluster portfolio --service packwright --desired-count 1',
    )
  })

  it.each(['deploymentConfiguration', 'healthCheckGracePeriodSeconds', 'loadBalancers'])(
    'fails when service.json has no %s',
    (key) => {
      const dir = mkdtempSync(join(tmpdir(), 'packwright-ecs-'))
      workDirs.push(dir)
      for (const name of readdirSync(ECS_DIR)) {
        const file = readJson<Record<string, unknown>>(join(ECS_DIR, name))
        if (name === 'service.json') delete file[key]
        writeFileSync(join(dir, name), JSON.stringify(file))
      }
      const result = deploy(dir, { FAKE_SERVICE: 'active' })
      expect(result.status).toBe(1)
      expect(serviceCalls(result.calls)).toEqual([])
      expect(result.output).toContain(`service.json needs ${key}`)
    },
  )

  it('waits again when the waiter times out', () => {
    const result = deploy(ECS_DIR, { FAKE_SERVICE: 'active', FAKE_WAIT_TIMEOUTS: '1' })
    expect(result.status).toBe(0)
    expect(
      result.calls.filter((call) => call.startsWith('aws ecs wait services-stable')),
    ).toHaveLength(2)
  })

  it('gives up after three waits that time out', () => {
    const result = deploy(ECS_DIR, { FAKE_SERVICE: 'active', FAKE_WAIT_TIMEOUTS: '3' })
    expect(result.status).toBe(1)
    expect(
      result.calls.filter((call) => call.startsWith('aws ecs wait services-stable')),
    ).toHaveLength(3)
    expect(result.calls.some((call) => call.startsWith('curl'))).toBe(false)
  })

  it('does not wait again when the waiter fails for another reason', () => {
    const result = deploy(ECS_DIR, { FAKE_SERVICE: 'active', FAKE_WAIT_TERMINAL: '1' })
    expect(result.status).toBe(1)
    expect(
      result.calls.filter((call) => call.startsWith('aws ecs wait services-stable')),
    ).toHaveLength(1)
    expect(result.calls.some((call) => call.startsWith('curl'))).toBe(false)
  })

  it('creates the service again when it is INACTIVE', () => {
    const result = deploy(ECS_DIR, { FAKE_SERVICE: 'inactive' })
    expect(result.status).toBe(0)
    expect(serviceCalls(result.calls)).toEqual([
      expect.stringMatching(/^aws ecs create-service --cli-input-json file:\/\//),
    ])
  })

  it('runs no setup and writes no revision for Packwright', () => {
    const result = deploy(ECS_DIR)
    expect(result.status).toBe(0)
    expect(result.calls.some((call) => call.startsWith('aws ecs run-task'))).toBe(false)
    expect(result.calls.some((call) => call.startsWith('aws ssm'))).toBe(false)
  })

  it('fails when the circuit breaker rolled the service back', () => {
    const result = deploy(ECS_DIR, { FAKE_SERVICE: 'active', FAKE_ROLLBACK: '1' })
    expect(result.status).toBe(1)
    expect(result.output).toContain('rolled')
    expect(result.calls.some((call) => call.startsWith('curl'))).toBe(false)
  })

  it('writes each job revision only after smoke passes', () => {
    const result = deploy(FIXTURE_DIR)
    expect(result.status).toBe(0)
    const written = result.calls.findIndex((call) => call.startsWith('aws ssm put-parameter'))
    expect(result.calls[written]).toBe(
      'aws ssm put-parameter --name /portfolio/example/cleanup-revision --type String --value 7 --overwrite --output json',
    )
    const lastSmoke = result.calls.findLastIndex((call) => call.startsWith('curl'))
    expect(lastSmoke).toBeGreaterThan(-1)
    expect(written).toBeGreaterThan(lastSmoke)
  })

  it('writes no job revision when smoke fails', () => {
    const result = deploy(FIXTURE_DIR, { FAKE_CURL_STATUS: '503' })
    expect(result.status).toBe(1)
    expect(serviceCalls(result.calls)).toHaveLength(1)
    expect(result.calls.some((call) => call.startsWith('aws ssm'))).toBe(false)
  })
})

describe('the deploy job', () => {
  it('builds one plain image per tag, with no provenance or SBOM attestation', () => {
    const workflow = readFileSync(join(here, '..', '.github', 'workflows', 'ci.yml'), 'utf8')
    const build = workflow.split('\n').find((line) => line.includes('docker buildx build'))
    expect(build).toBeDefined()
    expect(build).toContain('--provenance=false')
    expect(build).toContain('--sbom=false')
    expect(build).toContain('--push')
    expect(build).not.toContain('--load')
  })

  it('limits the job to 58 minutes and the build and push step to 8, with no separate push step', () => {
    const workflow = readFileSync(join(here, '..', '.github', 'workflows', 'ci.yml'), 'utf8')
    const job = workflow.slice(workflow.indexOf('\n  deploy:\n'))
    expect(job.slice(0, job.indexOf('\n    steps:'))).toContain('\n    timeout-minutes: 58\n')
    const build = job.slice(job.indexOf('- name: Build and push the image'))
    expect(build.slice(0, build.indexOf('run:'))).toContain('timeout-minutes: 8\n')
    expect(job).not.toContain('- name: Push the image')
    expect(job).not.toContain('docker push')
  })

  it('checks for the head of main before credentials and again right before the push', () => {
    const workflow = readFileSync(join(here, '..', '.github', 'workflows', 'ci.yml'), 'utf8')
    const job = workflow.slice(workflow.indexOf('\n  deploy:\n'))
    const first = job.indexOf('- name: Refuse a run that is not for the head of main')
    const credentials = job.indexOf('- name: Configure AWS credentials')
    const second = job.indexOf('- name: Refuse again, right before the push, if main moved')
    const build = job.indexOf('- name: Build and push the image')
    const deployStep = job.indexOf('- name: Deploy\n')
    expect(first).toBeGreaterThan(-1)
    // The order: first check, credentials, second check, build and push, deploy.
    expect(credentials).toBeGreaterThan(first)
    expect(second).toBeGreaterThan(credentials)
    expect(build).toBeGreaterThan(second)
    expect(deployStep).toBeGreaterThan(build)
    // Nothing sits between the second check and the push.
    expect(job.slice(second + 1, build).match(/- name:/g)).toBeNull()
    for (const step of [job.slice(first, credentials), job.slice(second, build)]) {
      // The commit goes through env, and the script text holds no expression.
      expect(step).toContain('RUN_SHA: ${{ github.sha }}')
      expect(step).toContain('REPO: ${{ github.repository }}')
      expect(step).toContain('GH_TOKEN: ${{ github.token }}')
      const script = step.slice(step.indexOf('run:'))
      expect(script).toMatch(/^run: deploy\/head-of-main\.sh\n/)
      expect(script).not.toContain('${{')
    }
  })
})

describe('head-of-main.sh', () => {
  const guard = (main: string) =>
    run([join(here, 'head-of-main.sh')], ECS_DIR, {
      RUN_SHA: 'aaaa111',
      REPO: 'owner/repo',
      GH_TOKEN: 'token',
      FAKE_MAIN_SHA: main,
    })

  it('passes when the run is for the head of main', () => {
    const result = guard('aaaa111')
    expect(result.status).toBe(0)
    expect(result.calls).toEqual(['gh api repos/owner/repo/branches/main --jq .commit.sha'])
  })

  it('refuses a run for any other commit, naming both', () => {
    const result = guard('bbbb222')
    expect(result.status).toBe(1)
    expect(result.output).toContain('This run is for aaaa111, but main is now bbbb222.')
    expect(result.output).toContain('run the workflow by hand on main')
  })
})

describe('smoke.sh', () => {
  it('asks the three addresses through the load balancer, each with a time limit', () => {
    const result = run([join(here, 'smoke.sh')], ECS_DIR)
    expect(result.status).toBe(0)
    const urls = result.calls.map((call) => call.split(' ').at(-1))
    expect(urls).toEqual([
      `https://${HOST}/`,
      `https://${HOST}/health`,
      `https://${HOST}/api/audit/status`,
    ])
    for (const call of result.calls) {
      expect(call).toContain(`--connect-to ${HOST}:443:${ALB_DNS_NAME}:443`)
      expect(call).toMatch(/--max-time \d+/)
    }
  })

  it('fails a status reply without available', () => {
    const result = run([join(here, 'smoke.sh')], ECS_DIR, {
      FAKE_CURL_BODY: '<div id="app"></div>',
    })
    expect(result.status).toBe(1)
    expect(result.output).toContain('FAIL: GET /api/audit/status')
  })

  it('stops at the first failed check and asks for no later one (existing behavior)', () => {
    const result = run([join(here, 'smoke.sh')], ECS_DIR, {
      FAKE_CURL_STATUS: '503',
      SMOKE_FIRST_SECONDS: '0',
    })
    expect(result.status).toBe(1)
    expect(result.output).toContain('FAIL: GET / did not answer 200')
    // The first check may make several requests before its deadline; none is for a later check.
    expect(new Set(result.calls.map((call) => call.split(' ').at(-1)))).toEqual(
      new Set([`https://${HOST}/`]),
    )
  })

  it('gives the first check 180 seconds and each later check 30 by default', () => {
    const code = codeOf('smoke.sh')
    expect(code).toContain('SMOKE_FIRST_SECONDS:-180')
    expect(code).toContain('SMOKE_SECONDS:-30')
  })

  it('keeps retrying the first check until it passes or its deadline passes', () => {
    const passes = run([join(here, 'smoke.sh')], ECS_DIR, {
      FAKE_CURL_FAIL_FIRST: '3',
      SMOKE_FIRST_SECONDS: '20',
    })
    expect(passes.status).toBe(0)
    expect(passes.calls).toHaveLength(6)
    const started = Date.now()
    const fails = run([join(here, 'smoke.sh')], ECS_DIR, {
      FAKE_CURL_STATUS: '503',
      SMOKE_FIRST_SECONDS: '2',
      SMOKE_DELAY_SECONDS: '1',
    })
    expect(fails.status).toBe(1)
    expect(Date.now() - started).toBeGreaterThanOrEqual(2000)
    expect(fails.calls.length).toBeGreaterThanOrEqual(2)
  }, 15000)

  it('gives a later check its own fresh deadline, not what is left of the first one', () => {
    // / (5 seconds) fails 4 times and passes on its fifth request, about 4 seconds in. /health (5
    // seconds) then fails 4 times and passes on its fifth, about 4 seconds after it began and 8 in: inside
    // its own window, but long past a window counted from the start of the run.
    const result = run([join(here, 'smoke.sh')], ECS_DIR, {
      FAKE_CURL_FAIL_ON: '1,2,3,4,6,7,8,9',
      SMOKE_FIRST_SECONDS: '5',
      SMOKE_SECONDS: '5',
      SMOKE_DELAY_SECONDS: '1',
    })
    expect(result.status).toBe(0)
    expect(result.calls).toHaveLength(11)
  }, 15000)

  it.each([
    ['SMOKE_FIRST_SECONDS', 'abc'],
    ['SMOKE_SECONDS', '-1'],
    ['SMOKE_DELAY_SECONDS', '1.5'],
    ['SMOKE_DELAY_SECONDS', '0'],
  ])('refuses %s=%s, naming the setting, before any request', (name, value) => {
    const result = run([join(here, 'smoke.sh')], ECS_DIR, { [name]: value })
    expect(result.status).toBe(2)
    expect(result.output).toContain(name)
    expect(result.calls).toEqual([])
  })

  it('fails the run when a later check never passes, and never asks for the next check', () => {
    const result = run([join(here, 'smoke.sh')], ECS_DIR, {
      FAKE_CURL_FAIL_ON: '2,3,4,5,6,7,8,9',
      SMOKE_SECONDS: '1',
      SMOKE_DELAY_SECONDS: '1',
    })
    expect(result.status).toBe(1)
    expect(result.output).toContain('FAIL: GET /health')
    expect(result.calls.some((call) => call.endsWith('/api/audit/status'))).toBe(false)
  }, 15000)

  it('passes when all three checks pass early, using one request each', () => {
    const result = run([join(here, 'smoke.sh')], ECS_DIR)
    expect(result.status).toBe(0)
    expect(result.calls).toHaveLength(3)
  })
})
