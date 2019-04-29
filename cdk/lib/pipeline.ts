
import cdk = require('@aws-cdk/cdk')
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import lambda = require('@aws-cdk/aws-lambda');
import secretsmanager = require('@aws-cdk/aws-secretsmanager');
import ssm = require('@aws-cdk/aws-ssm');


export function MakePipeline(stack: cdk.Stack, stackName: string, sourceRepo: string, lambdaStackName: string, lambdaSourceFolder: string, lambdaCode: lambda.CfnParametersCode) {

    const pipeline = new codepipeline.Pipeline(stack, stackName);
    const cdkSourceOutput = new codepipeline.Artifact();
    const cdkSourceAction = GitHubRepo(stack, 'CDK_Source', sourceRepo, cdkSourceOutput);

    pipeline.addStage({
        name: 'Source',
        actions: [cdkSourceAction]
    });

    const cdkBuildProject = makeCdkBuildProject(stack, stackName);

    const cdkBuildOutput = new codepipeline.Artifact();
    const cdkBuildAction = new codepipeline_actions.CodeBuildAction({
        actionName: 'CDK_Build',
        project: cdkBuildProject,
        input: cdkSourceOutput,
        output: cdkBuildOutput,
    });

    const lambdaBuildProject = makeLambdaBuildProject(stack, lambdaSourceFolder);
    const lambdaBuildOutput = new codepipeline.Artifact();
    const lambdaBuildAction = new codepipeline_actions.CodeBuildAction({
        actionName: 'Lambda_Build',
        project: lambdaBuildProject,
        input: cdkSourceOutput,
        output: lambdaBuildOutput,
    });

    pipeline.addStage({
        name: 'Build',
        actions: [cdkBuildAction, lambdaBuildAction],
    });

    pipeline.addStage({
        name: 'Deploy',
        actions: [
            new codepipeline_actions.CloudFormationCreateUpdateStackAction({
                actionName: 'Lambda_CFN_Deploy',
                templatePath: cdkBuildOutput.atPath(lambdaStackName + '.template.yaml'),
                stackName: lambdaStackName,
                adminPermissions: true,
                parameterOverrides: {
                    ...lambdaCode.assign(lambdaBuildOutput.s3Coordinates),
                },
                extraInputs: [
                    lambdaBuildOutput,
                ],
            }),
        ],
    });

    return pipeline;
};

function makeLambdaBuildProject(stack: cdk.Stack, code: string) {
    return new codebuild.Project(stack, 'LambdaBuildProject', {
        environment: {
            buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_GOLANG_1_10,
        },
        buildSpec: {
            version: '0.2',
            phases: {
                install: {
                    commands: [
                        'ln -s "${CODEBUILD_SRC_DIR}/src/' + code + '" "/go/src/handler"',
                        'go get golang.org/x/lint/golint',
                        'go get -u github.com/stretchr/testify'
                    ]
                },
                pre_build: {
                    commands: [
                        'cd "/go/src/handler"',
                        'go get ./...',
                        'golint -set_exit_status',
                        'go tool vet .',
                        'go test .'
                    ]
                },
                build: {
                    commands: [
                        'mkdir "${CODEBUILD_SRC_DIR}/build-output"',
                        'go build -o "${CODEBUILD_SRC_DIR}/build-output/main"',
                    ]
                },
            },
            artifacts: {
                'files': 'build-output/**/*',
                'discard-paths': 'yes'
            },
        },
    });
}

function makeCdkBuildProject(stack: cdk.Stack, lamabdaStackName: string) {
    return new codebuild.Project(stack, 'CdkBuildProject', {
        environment: {
            buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_1_0,
        },
        buildSpec: {
            version: '0.2',
            phases: {
                install: {
                    commands: [
                        'cd "${CODEBUILD_SRC_DIR}/cdk"',
                        'npm install'
                    ]
                },
                build: {
                    commands: [
                        'cd "${CODEBUILD_SRC_DIR}/cdk"',
                        'npm run build',
                        'npm run cdk synth ' + lamabdaStackName + ' -- -o ../',
                    ],
                },
            },
            artifacts: {
                files: lamabdaStackName + '.template.yaml',
            },
        },
    });
}

function GitHubRepo(stack: cdk.Stack, actionName: string, repo: string, output: codepipeline.Artifact) {

    const secretArnParam = new ssm.ParameterStoreString(stack, 'secretMgrArn', {
        parameterName: 'secretMgrArn'
    }).stringValue;;

    const secret = secretsmanager.Secret.import(stack, 'GitHubAccessToken', {
        secretArn: secretArnParam
    });


    return new codepipeline_actions.GitHubSourceAction({
        actionName: actionName,
        owner: 'msimpsonnz',
        repo: repo,
        oauthToken: secret.secretJsonValue('GitHubPAT'),
        output: output,
        branch: 'master'
    });
}