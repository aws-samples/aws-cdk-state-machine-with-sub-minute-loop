import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Set hit interval in seconds
    const hitIntervalInSeconds = 3;
    const hitDurationInSeconds = 1 * 60; // 1 minute * 60 seconds

    // The lambda function
    const playLambda = new lambda.Function(this, "playLambda", {
      description: "Lambda function that pulls will be triggered",
      handler: "playLambda.handler",
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromInline(`
exports.handler = async (event, context, callback) => {
  console.log('event: ', event);

  let index = event.iterator.index;
  let step = event.iterator.step;
  let count = event.iterator.count;

  // do your business

  callback(null, {
    index,
    step,
    count,
    continue: index < count ? "CONTINUE" : "END",
  });
};
      `),
    });

    const ConfigureCount = new sfn.Pass(this, "ConfigureCount", {
      result: {
        value: {
          count: Math.round(hitDurationInSeconds / hitIntervalInSeconds),
          index: 0,
          step: 1,
        },
      },
      resultPath: "$.iterator",
    });

    const Iterator = new tasks.LambdaInvoke(this, "PlayTask", {
      lambdaFunction: playLambda,
      payloadResponseOnly: true,
      retryOnServiceExceptions: false,
      resultPath: "$.iterator",
    });

    const Wait = new sfn.Wait(this, "Wait", {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(hitIntervalInSeconds)),
    }).next(Iterator);

    const Done = new sfn.Succeed(this, "Done");

    const IsCountReached = new sfn.Choice(this, "IsCountReached", {
      comment: "If the count is reached then end the process",
    })
      .when(sfn.Condition.stringEquals("$.iterator.continue", "CONTINUE"), Wait)
      .otherwise(Done);

    new sfn.StateMachine(this, "PlayStateMachine", {
      stateMachineName: "PlayStateMachine",
      definition: ConfigureCount.next(Iterator).next(IsCountReached),
    });
  }
}
